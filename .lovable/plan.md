## מטרה
שיפור שיעור ההצלחה של שליפת `yearBuilt`, `floorsCount`, `unitsCount` מתשובת `BLDG_FLOOR_USAGE` ב-GovMap, על ידי הרחבת ה-regex לשמות שדות נוספים והוספת פאלבק היוריסטי מבוסס טווחים מספריים.

## שינוי יחיד: `supabase/functions/fetch-plot-geometry/index.ts`

ב-Step 3 הקיים (בלוק ה-`try` סביב שורות ~110-150):

### 1. החלפת שלושת ה-regex

```ts
const YEAR_KEY = /^(year[_\s]?built|bldg[_\s]?year|shnat[_\s]?bniya|shnat_bniya|shnath|year|taarich|build[_\s]?year|construction[_\s]?year|שנת|שנה)$/i;
const FLOORS_KEY = /^(floors[_\s]?num|floor[_\s]?count|num[_\s]?floors|num_floors|komot|koma|floor|floors|mספר_קומות|kомот|FLOOR_NO|FLOORNUM|NUMFLOORS|FLOORSABOVE|floors_above|above_floors|stories)$/i;
const UNITS_KEY = /^(units[_\s]?num|unit[_\s]?count|num[_\s]?units|dwelling[_\s]?units|dirot|dira|apartments|num_units|yihadot|yechidot|UNITCOUNT|NUMUNITS|DWELLINGS|residential[_\s]?units)$/i;
```

### 2. איסוף כל המספרים בתשובה במהלך אותה סריקה

בתוך `walk()`, כאשר ערך נומרי לא תאם לאף `*_KEY`, להוסיף אותו ל-`allNumbers: number[]` (מערך נוסף). הסריקה הרקורסיבית הקיימת נשמרת — רק תוספת לאיסוף.

### 3. פאלבק היוריסטי לאחר ה-walk

לאחר ההצבה הקיימת של `yearBuilt`/`floorsCount`/`unitsCount`, להוסיף — רק כאשר השדה הספציפי עדיין `null`:

```ts
if (yearBuilt === null) {
  const cands = allNumbers.filter((n) => Number.isInteger(n) && n >= 1920 && n <= 2010);
  if (cands.length > 0) yearBuilt = Math.min(...cands); // הוותיק ביותר
}
if (floorsCount === null) {
  const cands = allNumbers.filter((n) => Number.isInteger(n) && n >= 2 && n <= 20);
  if (cands.length > 0) floorsCount = Math.max(...cands);
}
if (unitsCount === null) {
  const cands = allNumbers.filter((n) => Number.isInteger(n) && n >= 2 && n <= 200);
  if (cands.length > 0) unitsCount = Math.max(...cands); // ערך יחיד שמרני, לא סכום
}
```

### הערות
- הפאלבק רץ רק אם אף שדה ספציפי לא נתפס — כך שאין רגרסיה במקרים שבהם ה-regex כן מצא.
- שימוש ב-`Math.max` ליחידות (ולא בסכום כמו במסלול ה-regex) כדי להימנע מספירה כפולה של מספרים אקראיים בתשובה (קואורדינטות, ids וכו') שהם בטווח הזה.
- אין שינוי לפלט הסופי, לחוזה הקריאה, ל-PlotPicker או לפונקציות אחרות.
- אין שינויי DB / secrets / config.
