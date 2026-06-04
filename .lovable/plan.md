## הסרת "עיריית ת"א - היתרים" מחישוב יח"ד

### הקשר
המקור `tlv_permits` (שכבת היתרי בנייה של עיריית ת"א) משתתף כיום בבחירת יח"ד הקיימות ב-`pickBest` ב-`supabase/functions/lookup-plot-units/index.ts`, בעדיפות הגבוהה ביותר אחרי manual.

### שינוי
ב-`pickBest` (סביב שורות 729–756) — להסיר את שני הסעיפים שמחזירים `tlv_permits`:
- `tlvHigh` (עדיפות 2, אחרי manual)
- `tlvAny` (עדיפות 4, אחרי nadlan)

### מה לא משתנה
- הפונקציה `sourceTlvPermits` ממשיכה לרוץ ולהופיע בטבלת מקורות הנתונים לצורכי דיאגנוסטיקה (סטטוס, ספירת היתרים).
- `pickBestFloors` ו-`pickBestBuiltArea` כבר לא משתמשים ב-`tlv_permits` — אין שינוי שם.
- ה-UI ב-`PlotPicker.tsx` (label `'עיריית ת"א - היתרים'`) נשאר.

### סדר עדיפויות חדש ליח"ד
manual → nadlan → govmap_bldg → heuristic