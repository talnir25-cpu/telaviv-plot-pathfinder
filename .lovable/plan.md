## המטרה
שדרוג בדיקת השימור מ"ניחוש" (CKAN שלא מחזיר תוצאות + פוליגון UNESCO גס) לבדיקה סמכותית מול שכבת ה-GIS הרשמית של עיריית ת"א, עם מידע מפורט: שם המבנה, תב״ע שימור, רמת ההגבלות, כתובות מוכרזות, ולינק חי למפת ה-GIS.

## מקור הנתון החדש (נמצא)
**ArcGIS REST של עיריית ת"א, שכבה 682 — "מבנים ואתרים לשימור"**
`https://gisn.tel-aviv.gov.il/arcgis/rest/services/WM/IView2WM/MapServer/682/query`

- פוליגונים ב-EPSG:2039 (אותו CRS של ה-centroid שלנו מ-fetch-plot-geometry).
- תומך ב-`spatialRel=esriSpatialRelIntersects` → שאילתת point-in-polygon מדויקת.
- שדות שנוציא:
  - `shem_mivne` — שם המבנה ההיסטורי
  - `t_hatraa` — תיאור הסטטוס ("שימור מחמיר", "שימור רגיל", "אתר היסטורי")
  - `st_taba` — מספר תב״ע השימור (לרוב תא/2650/ב או תכניות נקודתיות)
  - `ktovot` — כל הכתובות המוכרזות תחת הפוליגון
  - `hagbalot` — דגל מספרי: 1 = הגבלות מחמירות (גם פנים המבנה מוגן), 0 = שימור חיצוני בלבד
  - `atraa_warn`, `tr_hatraot` — הערות והיסטוריית התראות

## שינויים

### 1) `lookup-conservation-status` (rewrite)
לוגיקה חדשה בסדר עדיפות:

1. **שאילתה מרחבית ל-ArcGIS 682** עם ה-centroid (כש-קיים).
   - אם נמצא פוליגון → `isConservation=true, confidence="high"`, יחד עם כל השדות לעיל.
   - אם לא נמצא → `isConservation=false, confidence="high"` (זו תשובה סמכותית).
2. **אם אין centroid עדיין** או ArcGIS נכשל → שאילתה אטריבוטיבית באותה שכבה לפי `ktovot LIKE '%גוש <X> חלקה <Y>%'` (best-effort, חלק מהרשומות כוללות גוש/חלקה בכתובות).
3. **fallback אחרון** — פוליגון UNESCO הקיים (`confidence="medium"`).
4. כשל מלא → `status: "unknown"` (לא חוסם).

תוספות:
- timeout 6 שניות לכל קריאה, fallback רך.
- מטמון בזיכרון לפי `gush-helka`.
- תרגום `t_hatraa` ו-`hagbalot` ל-`level` ("מחמיר" / "רגיל") + הסבר אנושי.
- שדה `mapLink` — דיפ-לינק ל-GIS הרשמי עם ה-OID להצגה למשתמש.

תגובה חדשה:
```jsonc
{
  "isConservation": true,
  "level": "מחמיר" | "רגיל" | null,
  "buildingName": "בית גולדמן",
  "planRef": "תא/2650/ב",
  "addresses": ["אחד העם 56"],
  "strictRestrictions": true,
  "inUnescoBuffer": true,
  "source": "tlv_arcgis_682",
  "confidence": "high",
  "mapLink": "https://gisn.tel-aviv.gov.il/iview2js/...&oid=12345",
  "reason": "..."
}
```

### 2) `PlotPicker.tsx` — תצוגה עשירה
מחליפים את ה-Badge הקצר בכרטיסיית פירוט (מוצגת רק כשנמצא שימור):
- כותרת: שם המבנה (אם קיים) + תווית רמה ("שימור מחמיר — דרגה א'" / "שימור רגיל").
- שורות פרטים: כתובות מוכרזות, מספר תב״ע, הערה רשמית.
- כפתור "צפייה במפת GIS" → פותח tab עם ה-mapLink.
- Badge קטן ליד ה-Switch: "אומת מ-GIS עיריית ת״א" (ירוק) / "במתחם UNESCO בלבד" (כתום) / "לא נמצא" (אפור).
- שמירה על הדריסה הידנית כפי שיש היום.

### 3) `analyze-plot/index.ts` (משדרג קל)
- ה-prompt ל-AI יקבל אובייקט `conservationDetails` (אם קיים): שם המבנה, רמת השימור, planRef, restrictions.
- האנליסט יידע להבחין בין "שימור חיצוני בלבד" (התחדשות אפשרית עם שימור חזיתות) ל"מחמיר" (כמעט חוסם).

### 4) `DashboardReport.tsx`
- במקום "שימור: כן/לא" — אם יש פרטים, להציג שורה משלימה: "שימור מחמיר — בית גולדמן (תא/2650/ב)".

## פרטים טכניים
- ArcGIS REST פתוח, ללא token; קריאות GET עם `f=json`.
- שאילתה לדוגמה:
  ```
  /MapServer/682/query?geometry={"x":179500,"y":664500,"spatialReference":{"wkid":2039}}
    &geometryType=esriGeometryPoint&inSR=2039&spatialRel=esriSpatialRelIntersects
    &outFields=oid,shem_mivne,t_hatraa,st_taba,ktovot,hagbalot,atraa_warn&returnGeometry=false&f=json
  ```
- אין שינוי DB, אין סודות חדשים.

## בדיקות
- cURL לפונקציה עם centroid במרכז העיר הלבנה (ידוע כשימור) ועם centroid בגבעת עמל (לא שימור) — לאמת `confidence=high` בשני המקרים.
- בדיקה ידנית ב-PlotPicker עם 2-3 חלקות מוכרות.
