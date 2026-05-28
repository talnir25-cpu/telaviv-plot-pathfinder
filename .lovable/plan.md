
# פוטנציאל הגדלת תכסית בהתחדשות עירונית — תצוגה + תמורה לדיירים

## מטרה

להציג בדוח את **הפער** בין התכסית הבסיסית (תב"ע קיימת) לתכסית הפוטנציאלית בהליך התחדשות, ולתרגם את הפער הזה ל**תמורה כספית/שטחית** לדיירים הקיימים.

---

## 1. הרחבת `setback-standards.ts`

טבלה חדשה `RENEWAL_SETBACKS` לפי `{quarter, track}`:

```text
track ∈ "tama38_2" | "pinui_binui" | "rova_plan"

RENEWAL_SETBACKS[quarter][track] = {
  front, side, rear,
  tenantShareOfUpliftPct,  // 25 לתמ"א, 40 לפינוי-בינוי, 30 לרובעית
  source: "תמ\"א 38/2 – הקלות ועדה מקומית" / וכו'
}
```

הטבלה היא **ברירת מחדל** — ה-AI יכול להחזיר override במסגרת ה-tool schema.

## 2. שינויי schema (`src/types/feasibility.ts`)

ב-`zoning` נוסיף בלוק חדש (אופציונלי, תאימות אחורה):

```text
zoning.renewalPotential?: {
  track: "tama38_2" | "pinui_binui" | "rova_plan";
  frontSetbackM, sideSetbackM, rearSetbackM: number;
  typicalFloorAreaSqm: number;       // אחרי הליך התחדשות
  coveragePct: number;
  upliftSqmPerFloor: number;         // delta vs baseline
  upliftPct: number;
  realizationFactor: number;         // 0.7–1.0
  effectiveUpliftSqm: number;        // upliftSqmPerFloor × proposed.floors × realizationFactor
  source: string;
}
```

השדות הקיימים (`typicalFloorAreaSqm`, `coveragePct`, `floorsNeededForFAR`) נשארים — הם מייצגים את ה-**baseline**.

ב-`FinancialReport` נוסיף:

```text
tenantUpliftFromCoverage?: {
  additionalGFA: number;             // effectiveUpliftSqm
  additionalValue: number;           // × avgSalePricePerSqm
  tenantSharePct: number;            // לפי המסלול
  tenantUpliftValue: number;         // additionalValue × share
  perUnitUpliftValue: number;        // / existingUnits
  perUnitUpliftSqm: number;          // tenantUpliftValue / pricePerSqm
}
```

## 3. שינויים ב-edge function `analyze-plot/index.ts`

### א. הזרקה ל-prompt
תוספת לסקציית הקווי בניין:
```text
מסלול התחדשות מסתמן: {track inferred from projectType + conservation}
תכסית פוטנציאלית בהליך התחדשות: כ-N מ"ר/קומה (X%)
דלתא מול תב"ע: +D מ"ר/קומה
```

### ב. tool schema — שדה אופציונלי
מאפשרים ל-AI להחזיר `zoning.renewalPotential` עם override של setbacks ו-`track` אם הוא מזהה תכנית רובעית/נקודתית ספציפית. אם לא — משתמשים בברירת המחדל מהטבלה.

### ג. חישוב דטרמיניסטי post-AI
```text
1. בחירת track (AI override → projectType → ברירת מחדל "tama38_2")
2. חישוב renewal typicalFloorArea מ-RENEWAL_SETBACKS
3. uplift = renewal - baseline
4. realizationFactor: 1.0 minus penalties (עצים, שימור, מרתפים)
5. אכלוס zoning.renewalPotential
```

### ד. RedFlag חדש — info חיובי
אם `effectiveUpliftSqm × proposed.floors > existingBuiltAreaSqm × 0.3`:
*"פוטנציאל משמעותי להגדלת תכסית במסלול {track} — תוספת של ~X מ"ר/דירה לדיירים."*

## 4. שינויים ב-`finance-engine.ts`

חישוב חדש (רץ רק אם `zoning.renewalPotential` קיים ו-`projectType ∈ {urban_renewal, combination}`):

```text
additionalGFA   = renewalPotential.effectiveUpliftSqm × proposed.floors
additionalValue = additionalGFA × avgSalePricePerSqm
tenantUplift    = additionalValue × tenantShareOfUpliftPct
perUnit         = tenantUplift / existingUnits
perUnitSqm      = (perUnit / avgSalePricePerSqm)
```

מאוכלס ב-`FinancialReport.tenantUpliftFromCoverage`. **לא** משפיע על `developerProfit` או `totalSalesRevenue` בשלב זה — רק תצוגה אינפורמטיבית (כדי לא לכפול ספירה: ההכנסות כבר משקפות את ה-built area המוצע).

## 5. תצוגה — `DashboardReport.tsx`

בכרטיס "תכנון ובינוי", **מתחת** לבלוק "תכסית וניצול" הקיים, בלוק חדש:

```text
┌─ פוטנציאל הגדלת תכסית בהתחדשות ──────────────┐
│ מסלול:                    פינוי-בינוי         │
│ תכסית בסיסית (תב"ע):     320 מ״ר (40%)      │
│ תכסית בהתחדשות:          440 מ״ר (55%)  ↑   │
│ תוספת לקומה:             +120 מ״ר (+37%)    │
│ מקדם מימוש מציאותי:      85%                │
│ תוספת אפקטיבית סה"כ:     1,224 מ"ר (12 ק')  │
└──────────────────────────────────────────────┘
```

הבלוק מוצג רק אם `zoning.renewalPotential` קיים.

## 6. תצוגה — `FinancialAnalysis.tsx`

בקטע "סיכום פרויקט" / "תזרים" — שורה ייעודית:

```text
┌─ תמורה לדיירים מהגדלת תכסית ────────────────┐
│ תוספת GFA פוטנציאלית:    1,224 מ"ר          │
│ שווי תוספת:              ₪39.2M             │
│ חלק הדיירים (40%):       ₪15.7M             │
│ לדירה (24 קיימות):       ₪653K ≈ ~20 מ"ר    │
│                                              │
│ ℹ הערה: השווי כלול בהכנסות הפרויקט,         │
│   זוהי תצוגה אינפורמטיבית בלבד.             │
└──────────────────────────────────────────────┘
```

## 7. מה לא בתוכנית

- **לא** משנים את חישוב `developerProfit` או `totalSalesRevenue` — ההכנסות כבר משקפות את ה-built area המוצע (שכבר כולל את הדלתא).
- **לא** מוסיפים שדות קלט חדשים בטופס המקדים. החישוב אוטומטי.
- **לא** נוגעים בלוגיקת `physicalConstraintsCost` הקיימת.
- **אין** שינויי DB.

## פרטים טכניים — קבצים שיתעדכנו

- `src/lib/setback-standards.ts` — `RENEWAL_SETBACKS` + `getRenewalSetbacks(quarter, track)` + `inferRenewalTrack(projectType, ...)`.
- `src/types/feasibility.ts` — `zoning.renewalPotential` + `FinancialReport.tenantUpliftFromCoverage`.
- `supabase/functions/analyze-plot/index.ts` — שדה ב-tool schema, הזרקה ל-prompt, חישוב post-AI, RedFlag.
- `supabase/functions/_shared/finance-engine.ts` — חישוב `tenantUpliftFromCoverage`.
- `supabase/functions/financial-analysis/index.ts` — העברת `zoning.renewalPotential` ל-engine.
- `src/components/DashboardReport.tsx` — בלוק תצוגה חדש.
- `src/components/FinancialAnalysis.tsx` — שורת תמורה לדיירים.

**תאימות אחורה**: כל השדות אופציונליים; דוחות ישנים ב-cache יציגו בדיוק כמו היום.

