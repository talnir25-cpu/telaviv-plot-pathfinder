## המטרה
להחליף את ה-Switch הידני "מבנה לשימור / איזור הכרזת UNESCO" בבדיקה אוטומטית שמתבצעת מיד עם בחירת חלקה, ומציגה תוצאה ברורה (כן/לא/לא ודאי) עם מקור הנתון. המשתמש עדיין יוכל לדרוס ידנית.

## מקורות נתונים (Tel Aviv Open Data + GovMap)
1. **רשימת בניינים לשימור של עיריית ת"א** — דאטהסט פתוח (`buildingsforpreservation` ב-opendata.tel-aviv.gov.il) הכולל כתובת, גוש, חלקה, רמת שימור (א/ב), והאם בתוך מתחם UNESCO.
2. **שכבת מתחמי שימור / White City UNESCO buffer zone** — פוליגון ידוע (לב העיר, רוטשילד, ככר דיזנגוף וכו'); נשתמש ב-GovMap WMS/WFS או פוליגון מקודד.
3. **תכניות שימור עירוניות** (תא/2650ב) — נציין כהפניה במידע.

## שינויים מוצעים

### 1) Edge Function חדש: `lookup-conservation-status`
קלט: `{ gush, helka, centroidX?, centroidY?, address? }`
לוגיקה:
- שאילתה ל-API של עיריית ת"א לפי גוש+חלקה.
- אם נמצא → מחזיר `{ isConservation: true, level: "א"|"ב", inUnescoBuffer: bool, source, planRef }`.
- אם לא — בדיקת point-in-polygon מול גבול UNESCO buffer (אם יש קואורדינטות).
- אם שני המקורות ריקים → `{ isConservation: false, confidence: "medium" }`.
- כשל רשת → `{ status: "unknown", reason }` (לא חוסם את הניתוח).
- Cache בזיכרון פנימי לפי `gush-helka`.

### 2) `PlotPicker.tsx`
- `useEffect` חדש שמופעל עם `selectedPlot` (במקביל ל-`runLookup`) וקורא לפונקציה החדשה.
- State: `conservationStatus: "checking" | "yes" | "no" | "unknown"`, `conservationMeta` (רמה, מקור, UNESCO).
- אם החזרה `yes` → `setConservation(true)` אוטומטית.
- ה-Switch הופך לתצוגה משולבת:
  - Badge עם תוצאה ("מבנה לשימור — דרגה א'" / "במתחם UNESCO" / "לא נמצא ברישומי שימור" / "לא ניתן לאמת").
  - אייקון מקור (כמו שאר השדות ב-PlotPicker).
  - כפתור "דריסה ידנית" שמאפשר לשנות את הערך.
- בשלב 1 ("זיהוי החלקה") יתווסף וי ירוק כשנמצא סטטוס ודאי (משלים את המנגנון הקיים).

### 3) השפעה במורד הזרם
- `analyze-plot` ימשיך לקבל `conservation: boolean` ללא שינוי חוזה.
- ב-prompt ל-AI נוסיף שדה אופציונלי `conservationDetails` (רמה, UNESCO) כדי לשפר את הניתוח כאשר זמין.
- ב-`DashboardReport` נציג את המקור והרמה במקום "כן/לא" יבש.

## פרטים טכניים
- ה-API של עיריית ת"א דורש לעיתים מפתח חינמי; נשתמש קודם בנקודות הציבוריות (CKAN datastore_search) ללא מפתח. במידת הצורך נוסיף סוד `TLV_OPENDATA_KEY`.
- פוליגון UNESCO buffer יקודד כקבוע ב-`_shared/unesco-buffer.ts` (≈100 קואורדינטות, ITM/EPSG:2039) — חוסך תלות ב-WMS חיצוני.
- כל הקריאות עם timeout של 6 שניות; כשל לא יחסום את ה-flow.

## הערות
- אין שינוי סכמה/DB.
- בדיקה: cURL ל-edge function עם כמה גושים מוכרים (לב העיר vs. גבעת עמל) לאימות.
