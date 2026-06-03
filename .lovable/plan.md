## מטרה
הוספת שליפת שנת בנייה אוטומטית מ-GovMap, אכלוס שדה חדש ב-PlotPicker, וקבלת הערך בלוגיקת זיהוי מסלול ההתחדשות.

## שינויים

### 1. `supabase/functions/fetch-plot-geometry/index.ts`
- אחרי Step 2 הקיים (שליפת ה-extent), להוסיף Step 3:
  - קריאה נוספת ל-`https://ags.govmap.gov.il/Identify/IdentifyByXY` באותן `x,y` עם `layers: [{ LayerType: 0, LayerName: "BLDG_FLOOR_USAGE" }]`, אותם headers/User-Agent כמו ב-Step 1-2.
  - **הערה:** האנדפוינט `api.govmap.gov.il` שצוין מחזיר 403 (אומת בלוגים קודמים) — נשתמש ב-`ags.govmap.gov.il` שכבר עובד עבור החלקות.
- פונקציית סריקה רקורסיבית על התשובה: לאסוף כל ערך מספרי תחת מפתח שתואם `YEAR_BUILT`/`yearBuilt` (case-insensitive) בטווח 1900–2024. אם נמצאו מספר ערכים (מספר מבנים) — לקחת `Math.min` (הבניין הוותיק ביותר).
- להוסיף `yearBuilt: number | null` לאובייקט התשובה הסופי שמכיל `{ width, depth, extent, source }`.
- כשל ב-Step 3 לא ייכשל את הפונקציה — `yearBuilt: null` ושאר השדות נשארים.
- הרחבת ה-`fallback()` כך שיחזיר גם `yearBuilt: null` כשרלוונטי (לשמירת חוזה אחיד).

### 2. `src/components/PlotPicker.tsx`
- הוספת state `const [buildingYear, setBuildingYear] = useState<string>("")` ו-`const [yearAutoFilled, setYearAutoFilled] = useState(false)`.
- הרחבת `GeomCacheEntry` ב-cache הקיים ל-`{ width, depth, yearBuilt: number | null } | null`.
- ב-`useEffect` הקיים של הגיאומטריה (גם במסלול ה-cache hit וגם במסלול הקריאה ל-edge):
  - אם `data.yearBuilt` קיים → `setBuildingYear(String(data.yearBuilt))` + `setYearAutoFilled(true)`.
  - אם לא קיים → לא לגעת בשדה (מאפשר קלט ידני).
  - איפוס `yearAutoFilled` כאשר המשתמש משנה ידנית את ה-input.
- שדה Input חדש "שנת בנייה" מתחת לשדות רוחב/עומק:
  - `type="number"`, `placeholder="לדוגמה: 1965"`.
  - אייקון `Sparkles` קטן עם tooltip "נשלף אוטומטית מ-GovMap" מוצג רק כאשר `yearAutoFilled === true`, באותו דפוס ויזואלי של רוחב/עומק.
- העברה ל-`AnalysisInput` בעת submit: `buildingYear: buildingYear ? Number(buildingYear) : undefined`.

### 3. `src/types/feasibility.ts`
- הוספת `buildingYear?: number;` ל-`AnalysisInput`.

### 4. `supabase/functions/analyze-plot/index.ts`
- הוספת `buildingYear?: number` ל-`PlotInput`.
- בקריאה הקיימת ל-`inferRenewalTrack` (סביב שורה ~350) להעביר את `buildingYear: body.buildingYear`.

### 5. `src/lib/setback-standards.ts`
- הרחבת חתימת `inferRenewalTrack` עם `buildingYear?: number`.
- סדר הלוגיקה החדש:
  1. אם `projectType` שולל renewal → `null` (כמו היום).
  2. אם `renewalSubtype` הוצהר במפורש → לכבד אותו (כמו היום).
  3. **חדש:** אם `buildingYear != null && buildingYear >= 1980` → `"rova_plan"`.
  4. אחרת — להמשיך ההיוריסטיקה הקיימת ללא שינוי (קומות/יחידות → `pinui_binui` / `tama38_2`).

## הערות
- אין שינויי DB, אין secrets חדשים, אין שינוי ב-`supabase/config.toml`.
- אין שינוי בחוזה הקיים של הצרכנים האחרים של `fetch-plot-geometry` (השדה החדש אופציונלי).
