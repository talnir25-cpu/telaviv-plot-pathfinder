
## מטרה
להפוך את המודל הפיננסי מ"AI מחשב + ולידציה חלקית" ל"**מנוע דטרמיניסטי + AI להנחות בלבד**". התוצאה: שתי הרצות זהות → תוצאה זהה לחלוטין, IRR אמיתי על תזרים חודשי, ולוגיקת מס נכונה.

---

## שלבי העבודה

### שלב 1 — מנוע חישוב דטרמיניסטי (`_shared/finance-engine.ts`)
מודול TypeScript טהור בתוך `supabase/functions/_shared/` שמקבל קלט מובנה ומחזיר `FinancialReport` מלא. **ללא AI**.

מבנה הפונקציות:
- `computeRevenues(input)` — פדיון ברוטו/נטו לפי מע"מ
- `computeHardSoft(input)` — Hard + Soft + דמי היתר
- `computeLandCost(input)` — לפי `projectType` (התחדשות=0 / חדש=מלא / קומבינציה=משוקלל)
- `computeTenantCosts(input)` — רק להתחדשות; כולל ערבויות חוק מכר + ליווי משפטי (2.5% מ-Hard)
- `computeBettermentTax(input)` — לוגיקה מובנית:
  - `urban_renewal` + תמ"א 38 → 0 (סעיף 19)
  - `urban_renewal` + פינוי-בינוי → 0 (פטור)
  - `new_construction` / `combination` → `uplift × bettermentTaxPct`
- `computePhysicalConstraints(input)` — עצים/מרתפים/מי תהום (כפי שקיים, אך ב-TS)
- `computeMonthlyCashflow(input)` — תזרים חודשי לכל אורך הפרויקט (S-curve להוצאות, מכירות לקראת סיום ו-3 חודשים אחרי איכלוס)
- `computeFinancingCosts(cashflow)` — ריבית על יתרת חוב חודשית (במקום מקדם 0.55)
- `computeIRR(cashflow)` — **Newton-Raphson** על NPV; bisection כ-fallback
- `computeSensitivity(input)` — מטריצת 3×3 ע"י קריאה חוזרת למנוע (לא ל-AI) — מובטח עקבי
- `computeBreakeven(input)` — חיפוש בינארי על מחיר המכירה
- `assembleReport(input)` — מקבץ הכל ל-`FinancialReport`

### שלב 2 — שינוי תפקיד ה-AI ב-`financial-analysis/index.ts`
- **`mode: "defaults"`** — נשאר כפי שהוא (AI מציע מחירים/עלויות לפי שוק)
- **`mode: "analyze"`** — משתנה מהותית:
  1. קורא ל-`assembleReport()` הדטרמיניסטי
  2. שולח את התוצאה ל-AI **רק** לקבלת `headline` ו-`notes` בעברית (תיאור מילולי של התוצאה)
  3. מחזיר תוצאה משולבת
- יתרון: עלות זולה יותר, מהיר יותר, יציב לחלוטין

### שלב 3 — ולידציית קלט (Zod)
בכניסה ל-edge function:
- כל המספרים `>= 0`
- `vatPct`, `softCostsPct`, `bettermentTaxPct` בטווח `0–100`
- `constructionMonths` בטווח `6–60`
- `developerLandSharePct` בטווח `0–100` (אם `combination`)
- שגיאות 400 ברורות בעברית

### שלב 4 — הרחבת `FinancialInput` ו-`FinancialReport`
- `FinancialInput`: הוספת `renewalSubtype?: "tama38" | "pinui_binui"` (משפיע על היטל השבחה)
- `FinancialReport`: הוספת `monthlyCashflow: Array<{month, inflow, outflow, balance}>` להצגה עתידית בגרף

### שלב 5 — טסטים (`finance-engine.test.ts`)
טסטי Deno עם תרחישים ידועים:
- תרחיש 1: התחדשות רגילה רווחית (ROC ~18%)
- תרחיש 2: בנייה חדשה גבולית
- תרחיש 3: קומבינציה 60/40
- תרחיש 4: הפסד (verdict=loss)
- בדיקת עקביות רגישות (תא 0,0 = תרחיש בסיס)
- בדיקת IRR מול ערך ידוע

### שלב 6 — שמירת תאימות UI
`FinancialAnalysis.tsx` ו-`ProfitGauge` ממשיכים לעבוד ללא שינוי — מבנה ה-`FinancialReport` נשמר (רק נוספים שדות, לא מוסרים).

---

## קבצים שישתנו/יווצרו

| קובץ | פעולה |
|------|-------|
| `supabase/functions/_shared/finance-engine.ts` | **חדש** — מנוע חישוב טהור |
| `supabase/functions/_shared/finance-engine.test.ts` | **חדש** — טסטים |
| `supabase/functions/financial-analysis/index.ts` | שכתוב מצב `analyze` + Zod |
| `src/types/feasibility.ts` | הוספת `renewalSubtype` + `monthlyCashflow` |
| `src/components/FinancialAnalysis.tsx` | תוספת קטנה: בחירת תת-סוג בהתחדשות (Radio) |

---

## פרטים טכניים

### IRR (Newton-Raphson)
```text
NPV(r) = Σ CFi / (1+r)^i
NPV'(r) = -Σ i·CFi / (1+r)^(i+1)
r(n+1) = r(n) - NPV(r) / NPV'(r)
```
- התחלה: `r = 0.10` (חודשי ~0.8%)
- עצירה: `|NPV| < 1` או 100 איטרציות
- Fallback ל-bisection בטווח `[-0.99, 10]` אם לא מתכנס
- החזרה: ריבית שנתית `(1+r_monthly)^12 - 1`

### S-curve להוצאות בנייה
פיזור Hard+Soft על פני `constructionMonths` לפי עקומה מצטברת:
```text
cumulative(t) = 1 / (1 + exp(-6·(t/T - 0.5)))
```
60% מההוצאות במחצית האמצעית — מקובל בענף.

### תזרים מכירות
- מכירות "על הנייר" — 40% מהפדיון פרוס לינארית מחודש 6 עד סוף הבנייה
- מסירת מפתח — 60% הנותרים בחודשים T עד T+3

---

## מה לא בתכנית הזו (לעתיד)
- מודל Monte Carlo / VaR
- ניתוח מס מע"מ מורכב (פטור דיירים, קיזוז תשומות)
- דוחות PDF מודפסים
- שמירת תרחישים ב-DB להשוואה

נדרש אישור להתחיל ליישם.
