## מאיפה מגיע ה-76%?

הערך **לא** מגיע ישירות מהדוח הדטרמיניסטי — הוא **מחושב מחדש בקליינט** ב-`src/components/DashboardReport.tsx` (שורות 918–920):

```ts
const propFloors = report.proposed.floors || 1;
const propFloorArea = report.proposed.builtAreaSqm / propFloors;
const propCoverage = (propFloorArea / plotArea) * 100;
```

כלומר זה back-compute: "אם פיזרנו את כל ה-built area בצורה אחידה על כל הקומות, איזה אחוז מהמגרש זה תופס".

ב-`supabase/functions/analyze-plot/index.ts` (מסלול `floors_density`, שורה 498), `proposedBuilt = typicalFloorArea × maxFloors`, ו-`typicalFloorArea` נגזר מקווי הבניין של התקנון (`effectiveSetbacks`). לכן בפועל:

```
propCoverage ≈ report.zoning.coveragePct   (= תקרת הכיסוי הגזורה מקווי הבניין)
```

בדוגמה (קיים 2,674 / מוצע 3,382 / 76%): 3,382 ÷ 9 קומות ≈ 376 מ"ר/קומה ÷ ~495 מ"ר מגרש ≈ 76%. המתמטיקה תואמת — הערך הוא תקרת הכיסוי החוקית לפי קווי הבניין, לא תוצאה של תכנון בפועל.

## הבעיות

1. **חוסר שקיפות** — המשתמש רואה "76% מוצע" בלי לדעת שזה למעשה "מקסימום חוקי לפי קווי בניין", לא תכסית שעלתה ממידול תכנוני.
2. **רגישות לעיגולים** — חישוב חוזר מ-`builtAreaSqm / floors` נותן ערך שונה במעט מ-`report.zoning.coveragePct` שכבר נשמר בדוח.
3. **בלי תגית מקור** — בעמודת "קיים" יש כבר `CoverageSourceTag` (GIS/חישוב פנימי), אבל בעמודת "מוצע" אין שום סימון.
4. **חוסר עקביות עם מסלולי התחדשות** — כש-`renewalPotential.coveragePct` קיים (מסלול אחר), הוא מתעלם.

## הפתרון המוצע

### 1. קרא ישירות מהדוח הדטרמיניסטי במקום back-compute
ב-`DashboardReport.tsx`, החלף את `propCoverage` המחושב במקומי בעדיפויות הבאות:
1. `report.zoning.renewalPotential?.coveragePct` (אם המסלול הפעיל מספק תקרה ייעודית)
2. `report.zoning.coveragePct` (תקרה מקווי בניין של התקנון)
3. fallback ל-back-compute הקיים — רק אם שני המקורות לעיל חסרים

### 2. הוסף `CoverageSourceTag` חדש לעמודת "מוצע"
תגיות חדשות (מקבילות לתגיות הקיימות בעמודת "קיים"):
- `מסלול התחדשות` (כחול) — כשהערך מגיע מ-`renewalPotential.coveragePct`
- `קווי בניין תקנון` (סגול) — כשמגיע מ-`zoning.coveragePct`
- `חישוב מבנוי/קומות` (אמבר) — אם נשארנו ב-fallback

### 3. עדכן את ההסבר בעמודת "הסבר"
הוסף משפט קצר שמבהיר: "התכסית המוצעת היא תקרה תכנונית הנגזרת מקווי הבניין בתקנון — לא ממידול בפועל".

### 4. דגל מערכת (אופציונלי) ב-`analyze-plot`
אם `coveragePctVal > 60` והמגרש קטן (`<500 מ"ר`), הוסף red flag ברמת `info`: "תכסית תכנונית מקסימלית גבוהה (X%) — בפועל ועדות מקומיות לרוב דורשות הקטנה לטובת אוורור/חצרות".

## קבצים שיתעדכנו

- `src/components/DashboardReport.tsx` — לוגיקת `propCoverage`, רכיב `CoverageSourceTag` (הרחבה לטיפוס מקור חדש), עמודות "מוצע" ו"הסבר" בשורת התכסית.
- `supabase/functions/analyze-plot/index.ts` — (אופציונלי, רק אם תאשר סעיף 4) הוספת red flag.

## מה לא משתנה

- חישובי `proposedBuilt`, `floors`, `units` — נשארים כפי שהם.
- מבנה הטבלה ושאר השורות.

האם להמשיך לסעיפים 1–3 בלבד, או לכלול גם את סעיף 4 (red flag)?
