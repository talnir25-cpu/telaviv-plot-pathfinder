
## הבעיה
ב-`DashboardReport` בלשונית "זכויות בנייה ותקנון", שדה "תכסית" מוצג כיום כערך אחד (`report.zoning.coveragePct`). כש-GIS מצליח, ה-edge דורס את הערך הזה ב-`coverageExact` (40.6%), אבל:
- הכותרת המשנית עדיין כתובה "קירוב מלבני מקווי הבניין".
- שטח הקומה הטיפוסי לידו עדיין מבוסס על קירוב מלבני מקווי הבניין — שני ערכים ממקורות שונים מוצגים יחד.
- `buildingFootprint` הקיים ו-`coverageStatus` לא מוצגים בדוח כלל.
- `renewalPotential.upliftPct` מחושב מול תכסית הבסיס שדרסנו, מה שמנפח את ה-uplift.
- אין red-flag כש-תכסית קיימת > תכסית סטטוטורית (חריגה היסטורית).

## עקרון
להפריד בין שני מושגים:
- **תכסית קיימת (GIS)** — שטח המבנה הקיים בפועל. ערך עובדתי.
- **תכסית תכנונית (קווי בניין)** — המעטפת המותרת. בסיס לחישוב `floorsNeededForFAR` ול-uplift.

## שינויים

### 1) `supabase/functions/analyze-plot/index.ts`
- להפסיק לדרוס את `report.zoning.coveragePct` ב-`coverageExact`.
- להוסיף שדות חדשים ל-`report.zoning`:
  - `coverageExistingPct` (= `coverageExact` כש-reliable)
  - `buildingFootprintSqm` (= `buildingFootprint`)
  - `coverageSource` (= `coverageStatus`)
- להשאיר את `coveragePct` כקירוב מלבני (הוא הבסיס ל-`floorsNeededForFAR` ול-`renewalPotential.upliftPct` — לא לשנות חישובים אלו).
- להוסיף red-flag חדש: אם `coverageExistingPct > coveragePct + 5` → "חריגה היסטורית מהמעטפת הסטטוטורית — בדיקה משפטית נדרשת".
- להוסיף ל-`report.sources` את `coverageStatus` (קיים כבר).

### 2) `src/types/feasibility.ts`
- להוסיף ל-`ZoningSummary`: `coverageExistingPct?`, `buildingFootprintSqm?`, `coverageSource?`.

### 3) `src/components/DashboardReport.tsx` (סביבות 556-608)
- בכרטיס "שטח קומה טיפוסי":
  - להציג `(תכסית תכנונית {coveragePct}%)` במקום `(תכסית {coveragePct}%)`.
  - הכיתוב מתחת נשאר "קירוב מלבני מקווי הבניין" — נכון כעת.
- להוסיף כרטיס חדש לידו (כש-`coverageExistingPct != null`):
  - כותרת: "תכסית קיימת (GIS עירוני)" עם אייקון.
  - ערך: `{coverageExistingPct}%`.
  - שורה משנית: `שטח מבנה: {buildingFootprintSqm} מ"ר`.
  - תגית מקור קטנה: `{coverageSource}`.
  - אם יש חריגה (`coverageExistingPct > coveragePct + 5`): badge "חריגה היסטורית" בצבע אזהרה.

### 4) ללא שינוי
- `kpi-calculations.ts`, `renewalPotential` — נשארים על בסיס המעטפת התכנונית.
- `PlotPicker.tsx` — כבר מציג נכון את שני הערכים בשלב הקלט.

## קבצים נערכים
- `supabase/functions/analyze-plot/index.ts`
- `src/types/feasibility.ts`
- `src/components/DashboardReport.tsx`
