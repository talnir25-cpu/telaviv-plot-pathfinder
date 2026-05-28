
# הרחבת ודיוק פירוט ההכנסות בתחשיב הפיננסי

מטרה: להחליף את חישוב ההכנסות הנוכחי (מחיר ממוצע × שטח כולל) במודל מפורט שמשקף Unit Mix, פרמיות קומה, שטחים נלווים, מקדמי שיווק ואינדקסציה לאורך תקופת המכירה. כל הפרמטרים יקבלו ברירות מחדל מ-AI עם אפשרות עריכה ידנית.

## 1. הרחבת המודל (`src/types/feasibility.ts`)

הוספת בלוק `revenue` ל-`FinancialInput`:

```text
revenue: {
  unitMix: UnitMixRow[]              // פילוח דירות למכירה
  ownerReturnUnits: number           // דירות בעלים — לא בהכנסות
  ownerReturnAvgSizeSqm: number      // שטח ממוצע מוחזר + 25 מ״ר ממ״ד
  floorPremiumPctPerFloor: number    // 0.8% ברירת מחדל
  penthousePremiumPct: number        // 25% ברירת מחדל
  gardenApartmentPremiumPerSqm: number // ₪/מ״ר חצר
  storageUnitsCount: number          // מחסנים
  storagePricePerUnit: number        // 25,000 ₪
  extraParkingCount: number          // חניות עודפות
  extraParkingPricePerUnit: number   // 120,000 ₪
  balconyPricePerSqm: number         // 60% ממחיר דירה
  commercialAreaSqm: number          // שטחי מסחר
  commercialPricePerSqm: number      // ₪/מ״ר מסחרי
  marketingDiscountPct: number       // 2%
  brokerageFeePct: number            // 2%
  presalesPct: number                // 30% למימון
  absorptionRatePerMonth: number     // יח״ד/חודש
  priceEscalationPctPerYear: number  // 3% צמיחת מחירי דיור
}

UnitMixRow = {
  type: "studio" | "2room" | "3room" | "4room" | "5room" | "penthouse" | "garden"
  count: number
  avgSizeSqm: number
  pricePerSqm: number   // ניתן לדריסה ידנית
}
```

הוספת בלוק `revenueBreakdown` ל-`FinancialReport` שמחזיר את הפילוח השורה-שורה להצגה.

## 2. מנוע החישוב (`supabase/functions/_shared/finance-engine.ts`)

החלפת `totalSalesRevenue = avgSalePricePerSqm * estimatedSellableArea` בפונקציה `computeRevenue(input)`:

```text
לכל שורה ב-unitMix:
  basePrice = avgSize × pricePerSqm
  floorAdj  = ממוצע משוקלל לפי מספר קומות
  typeAdj   = פנטהאוז/גן premium
  rowRevenue = count × basePrice × (1 + floorAdj) × (1 + typeAdj)

ancillary = מחסנים + חניות עודפות + מרפסות + מסחר
gross    = Σ rows + ancillary
indexed  = gross × (1 + escalation)^(salesDurationYears/2)   // ממוצע מכירה באמצע
afterDiscounts = indexed × (1 - marketingDiscount)
netToDeveloper = afterDiscounts × (1 - brokerage)

salesDurationMonths = totalUnits / absorptionRate
```

דירות בעלים נכללות רק בעלויות בנייה (שטח נבנה) ולא בהכנסות — וידוא שהקיים נשמר.

## 3. ברירות מחדל מ-AI (`supabase/functions/financial-analysis/index.ts`)

הרחבת ה-prompt וה-JSON Schema של `Output.object` כך שהמודל יחזיר גם:
- Unit Mix מומלץ לפי סך היח״ד החדשות (פיזור 3/4/5 חדרים + 1-2 פנטהאוזים)
- מחיר ₪/מ״ר לפי סוג יחידה (בסיס מהאזור)
- פרמיות קומה/פנטהאוז ריאליסטיות לאזור
- מספר מחסנים = מספר דירות; חניות עודפות = 0-15% מהיח״ד
- absorption rate סביר לפי גודל פרויקט
- escalation בהתאם לתחזית שוק

הפרמטרים מוחזרים כ-defaults; המשתמש יכול לדרוס כל שדה.

## 4. UI — `src/components/FinancialAnalysis.tsx`

**טאב/אקורדיון חדש "הכנסות מפורטות"** מעל כרטיס ההכנסות הקיים:

```text
┌─ Unit Mix (טבלה עריכה) ─────────────────────┐
│ סוג │ כמות │ שטח ממ׳ │ ₪/מ״ר │ סה״כ ₪      │
│ 3ח׳ │  12  │   85    │ 52,000│ 53.0 מ׳     │
│ 4ח׳ │   8  │  110    │ 50,000│ 44.0 מ׳     │
│ פנט.│   2  │  140    │ 65,000│ 18.2 מ׳     │
└──────────────────────────────────────────────┘

┌─ פרמיות ─────────────┐  ┌─ שטחים נלווים ──┐
│ פר׳ קומה: 0.8%/קומה  │  │ מחסנים: 22×25K  │
│ פנטהאוז:  +25%       │  │ חניות+: 3×120K  │
│ דירת גן: 1,200 ₪/מ״ר │  │ מסחר: 0 מ״ר     │
└──────────────────────┘  └─────────────────┘

┌─ שיווק ומימוש ───────────────────────────┐
│ הנחות: 2% │ עמלות: 2% │ Pre-sales: 30%  │
│ קצב מכירה: 4 יח״ד/חודש │ אינד׳: 3%/שנה  │
└──────────────────────────────────────────┘
```

כרטיס "הכנסות" הקיים יציג עכשיו 4 שורות:
- פדיון ברוטו (Unit Mix + פרמיות)
- + הכנסות נלוות (מחסנים/חניות/מסחר)
- − הנחות שיווק ועמלות
- = **פדיון נטו ליזם** (זה שזורם ל-P&L)

ליד כל שורה: tooltip עם נוסחת החישוב.

## פרטים טכניים

- **כל פרמטר אופציונלי** ב-TypeScript — תאימות אחורה לתחשיבים קיימים.
- מנוע החישוב נשען על ברירות מחדל פנימיות אם בלוק `revenue` חסר (מתנהג כמו היום: מחיר ממוצע × שטח).
- AI defaults מוחזרים יחד עם שאר ה-defaults הקיימים — בקשה אחת, לא שתי