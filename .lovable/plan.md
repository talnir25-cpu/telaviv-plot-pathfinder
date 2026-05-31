## הבעיה

`proposed.units`, `proposed.builtAreaSqm` ו-`proposed.floors` מגיעים כיום מה-AI (Gemini) בתוך `analyze-plot`. כל קריאה חוזרת לאותה חלקה מחזירה ערכים מעט שונים, כי המודל לא דטרמיניסטי.

## הפתרון

להוסיף **שכבת חישוב דטרמיניסטית** ב-`supabase/functions/analyze-plot/index.ts` שרצה אחרי שה-AI חוזר, ודורסת את שלושת השדות לפי נוסחה קבועה. ה-AI ימשיך להחזיר `zoning` (maxFAR, maxFloors, maxHeightMeters), דגלים אדומים, סיכום ועדה — אבל היקף הבנייה המוצעת ייגזר אך ורק מהקלט והתקנון.

## הנוסחה (קבועה, ללא רנדומליות)

קלט: `plotArea`, `existingUnits`, `existingFloors`, `quarter`, `renewalTrack` (כבר מחושב), `typicalFloorAreaSqm` (קווי בניין סטטוטוריים), `renewalFloorArea` (קווי בניין מוקלים), `zoning.maxFAR`, `zoning.maxFloors`, `zoning.maxHeightMeters`.

1. **שטח קומה אפקטיבי**
   `floorAreaEff = renewalFloorArea || typicalFloorAreaSqm`

2. **שטח בנוי מוצע** (התנגשות בין שלוש מגבלות, נבחר המינימום):
   - `byFAR = plotArea × maxFAR`
   - `byEnvelope = floorAreaEff × maxFloors`
   - `proposedBuiltAreaSqm = round(min(byFAR, byEnvelope))`

3. **קומות מוצעות**
   `proposedFloors = min(maxFloors, ceil(proposedBuiltAreaSqm / floorAreaEff))`

4. **גובה מוצע**
   `heightMeters = min(maxHeightMeters, proposedFloors × 3.2)`

5. **יח״ד מוצעות** — שילוב של מכפיל מסלול וצפיפות פיזית, נבחר המינימום:
   - מכפיל מסלול קבוע (טבלה למטה) → `byMultiplier = round(existingUnits × multiplier)`
   - צפיפות פיזית: `sellableArea = proposedBuiltAreaSqm × 0.78` (ברוטו→נטו מכירה), `byDensity = floor(sellableArea / avgUnitSize)`, כאשר `avgUnitSize = 95 מ"ר`
   - `proposedUnits = min(byMultiplier, byDensity)`, ולא פחות מ-`existingUnits`

טבלת מכפילי מסלול (קבועה):
| מסלול        | multiplier |
|--------------|-----------:|
| tama38_2     | 1.6        |
| rova_plan    | 2.3        |
| pinui_binui  | 3.0        |

6. **גזרים** — `metrics.multiplier`, `metrics.newUnits`, `metrics.estimatedSellableArea`, `metrics.avgUnitSize`, `proposed.far` מחושבים מחדש מהערכים שלמעלה.

## איפה הקוד משתנה

קובץ יחיד: `supabase/functions/analyze-plot/index.ts`, בבלוק ה-post-validation (סביב שורה 395). מוסיפים פונקציה פנימית `computeProposed(...)` ודורסים את `report.proposed` ו-`report.metrics` לפני ההחזרה. אם `plotArea` או `maxFAR`/`maxFloors` חסרים — נופלים בחזרה לערכי ה-AI (failsafe).

טיפוסים ב-`src/types/feasibility.ts` נשארים כמו שהם. לקוח לא משתנה.

## מה זה מבטיח

- אותה חלקה + אותם פרמטרי משתמש (יח״ד קיימות, קווי בניין, שימור) ⇒ אותם `proposed.units`, `proposed.builtAreaSqm`, `proposed.floors` בכל הרצה.
- הניתוח האיכותני (דגלים, סיכום) עדיין יכול להשתנות מעט, אבל המספרים הגרעיניים יציבים.
- שינוי קל בקלט (למשל הזנת קווי בניין ידנית) ⇒ שינוי צפוי ומוסבר במספרים.

## מה לא כלול

- שינוי במנוע הפיננסי — הוא כבר דטרמיניסטי וצורך את `proposed` כקלט, אז ייהנה אוטומטית מהיציבות.
- שינוי ב-UI / רכיבים.
- שינוי בלוגיקת ה-renewalPotential (נשארת כפי שהיא).