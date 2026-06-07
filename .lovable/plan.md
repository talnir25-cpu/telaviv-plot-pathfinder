## הבעיה

לויצמן 33: הבניין הוא 3 קומות, אך הפונקציה מחזירה 4. שתי תקלות מצטברות:

1. **מיפוי תוויות עברית שגוי** — הפרומפט ממפה `ראשונה=1, שניה=2, שלישית=3` ומחבר עוד `+1` עבור `קרקע`. אבל בנסחי טאבו רבים בישראל "קומה ראשונה" היא **שם נרדף לקומת קרקע** (קומת הכניסה), ולא הקומה שמעליה. התוצאה: ספירה כפולה.
2. **חישוב במקום קריאה** — אנחנו מנחשים מספר קומות מתוך תוויות הדירות, במקום לקרוא את **שדה הקומות המפורש** שמופיע בתיאור הנכס בנסח (אם יש).

## תיקון

### 1. שליפת מספר קומות ישיר מהנסח (עדיפות עליונה)

ב־`supabase/functions/parse-tabu-pdf/index.ts`, להוסיף לסכמת ה-tool שדה חדש:

```ts
floorsExplicit: { type: ["number","null"], 
  description: "מספר הקומות אם מצוין במפורש בנסח (למשל בתיאור הנכס/הרכוש המשותף: 'בית בן X קומות'). null אם לא מצוין במפורש." }
```

ולהורות לפרומפט: **אם השדה הזה לא null — זה הערך הסופי, התעלם מהחישוב לפי תוויות**.

### 2. נרמול תוויות עברית

הוספת הוראה ברורה לפרומפט:
- `ראשונה` = `א`
- `שניה` = `ב`  
- `שלישית` = `ג` ...
- **שים לב**: אם בנסח מופיעות *גם* `קרקע` *וגם* `ראשונה` עבור אותו מתחם תת-חלקות — בדוק אם זו אותה קומה פיזית (בניינים ישנים שבהם "ראשונה" = קרקע). אם כן, אל תספור פעמיים.

### 3. לוגיקת השרת — חכמה יותר

במקום `floors = (hasGround?1:0) + highestAboveGround + (hasRoof?1:0)`:

```ts
// סדר עדיפות:
// 1. floorsExplicit אם קיים
// 2. אחרת: highestAboveGround + (hasRoof?1:0)
//    (לא מוסיפים +1 לקרקע — כי "ראשונה=1" כבר מייצג את הקומה הראשונה הפיזית
//     ברוב הנסחים. הקרקע נספרת רק אם labels מכילים "קרקע" *ואין* "ראשונה".)
const fd = raw.floorsDetected;
const hasFirst = fd.labels.some(l => /ראשונה|^א$/.test(l));
let computed;
if (raw.floorsExplicit) {
  computed = raw.floorsExplicit;
} else if (hasFirst) {
  // "ראשונה" כבר סופרה ב-highestAboveGround
  computed = fd.highestAboveGround + (fd.hasRoof ? 1 : 0);
} else {
  computed = (fd.hasGround?1:0) + fd.highestAboveGround + (fd.hasRoof?1:0);
}
raw.floors = computed || raw.floors;
```

לויצמן 33: `highestAboveGround=3`, `hasFirst=true`, `hasRoof=false` → **3 קומות**. ✓

### 4. תצוגה ב-UI

ב־`PlotPicker.tsx` — להוסיף ל-tooltip את `floorsExplicit` אם קיים ("מצוין בנסח: X קומות") כדי שהמשתמש יראה את מקור הנתון.

## קבצים שיתעדכנו

- `supabase/functions/parse-tabu-pdf/index.ts` — סכמה, פרומפט, לוגיקת חישוב.
- `src/types/feasibility.ts` — `floorsExplicit?: number | null`.
- `src/components/PlotPicker.tsx` — תצוגת מקור בטולטיפ.

## אימות

לאחר פריסה אוטומטית, להעלות שוב את נסח ויצמן 33 ולבדוק שב-payload מתקבל `floors: 3` עם `floorsExplain` קצר ומדויק.
