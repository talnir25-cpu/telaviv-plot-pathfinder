
## המצב הקיים

כיום ה-edge function `lookup-plot-units` משלב 3 מקורות:
1. **nadlan** — ספירת תת-חלקות מעסקאות נדל"ן (lower bound).
2. **govmap_bldg** — שכבת BUILDINGS של GovMap (שטח × קומות ÷ 80).
3. **tlv_permits** — שכבת היתרים 772 של עיריית ת"א (`yechidot_diyur`).
4. heuristic — fallback.

מה שעדיין חסר: אימות "כמה יח"ד **קיימות בפועל**" לחלקות ישנות שלא דיגיטליות, ומספר קומות מדויק בלי לסמוך על היתרים בלבד.

---

## מקורות נוספים מוצעים (לפי עדיפות)

### 1. שכבת מבנים של עיריית ת"א — `buildings` (Layer 511/514)
`https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer`

לכל מבנה ב-GIS העירוני יש שדות:
- `floors_abv` / `komot` — מספר קומות מעל הקרקע (מדידה פיזית, לא מהיתר)
- `floors_und` — קומות מרתף
- `mspr_yech_diyur` — מספר יח"ד בפועל (היכן שמתוחזק)
- `shimush` — שימוש (מגורים/מסחר/מעורב)
- `shnat_bniya` — שנת בנייה
- `gobah` — גובה במטרים

**יתרון:** נתון פיזי-מדידתי. **חולשה:** לא לכל מבנה יש `mspr_yech_diyur` ממולא.

### 2. ארנונה / מאגר נכסים עירוני — Layer "נכסים לארנונה"
שכבה ציבורית מסוימת חושפת ספירת **יחידות שומה** לכל בניין (כל דירה = שומה נפרדת). זהו ה-Ground truth הקרוב ביותר ל"כמה דירות קיימות פיזית", כי הארנונה גובה לפי דירה בפועל.
זמינות: דרך data.gov.il (קובץ "נכסים עירוניים בתל אביב") או דרך REST של GIS העירוני.

### 3. שכבת "פרסום הקלות/תכניות" — מבט מנהל התכנון (XPlan)
`https://ags.iplan.gov.il/arcgisiplan/rest/services/PlanningPublic/Xplan/MapServer`
לכל תכנית מאושרת/בהפקדה יש שדה `units_total` ו-`floors_above_ground`. שימושי בעיקר ל**מתוכנן** (תב"ע חלה), לא לקיים.

### 4. שכבת בניינים ארצית — Israel Building Footprints (LandSat/OSM)
- **OpenStreetMap Overpass API** — `building:levels`, `building:flats`, `addr:housenumber`. כיסוי ת"א טוב יחסית, אבל לא רשמי.
- **Microsoft Building Footprints (Bing)** — geometries בלבד, ללא מאפיינים.

### 5. שכבת תיקי בניין סרוקים (אם אפשר scraping)
פורטל "תיק בניין" של עיריית ת"א מחזיר לכל כתובת רשימת היתרים עם תכניות בהיתר (PDF). אפשר לחלץ מספר יח"ד מטקסט ה-OCR, אבל זה כבד ולא יציב.

### 6. שכבת אזורי סטטיסטיים של הלמ"ס
`https://www.cbs.gov.il/he/Pages/geo-statistical-areas.aspx` — נותן יח"ד **לאזור סטטיסטי** (אלפי מ"ר), לא לחלקה בודדת. שימושי רק לאימות סדר גודל / לבדיקת סבירות.

### 7. Google Places API + Street View Static
אומדן ויזואלי: לוקחים תמונת רחוב של הכתובת, סופרים חלונות לפי קומה ב-AI vision (Lovable AI עם `google/gemini-2.5-pro` תומך תמונות). זה נותן אומדן נוסף **בלתי-תלוי** במקורות הממשלתיים — שימושי במיוחד לאימות מול ה-`tlv_permits`.

---

## ההצעה המעשית: להוסיף 2 מקורות חדשים

### A. `tlv_buildings` — שכבת מבנים פיזית של ת"א (חדש)
זה הפער הגדול ביותר. נוסיף `sourceTlvBuildings(centroidItm)` שמבצע Identify על שכבת המבנים (Layer 514 או 511, נבדוק במהלך המימוש) ומחזיר:
- `floors` = `floors_abv` (מספר קומות פיזי — אמין יותר מהיתר)
- `units` = `mspr_yech_diyur` כשממולא, אחרת `null`
- `confidence: high` לקומות, `high`/`medium` ליח"ד בהתאם למילוי השדה

זה ייפתור את שני הפערים בבת אחת: גם יאמת מספר קומות מול ההיתר, וגם ייתן יח"ד פיזי לחלקות ישנות.

### B. `osm_building` — fallback אוניברסלי (לא רק ת"א)
שאילתת Overpass לפי גוש/חלקה (דרך bbox מ-centroid) שמחזירה `building:levels` ו-`building:flats`. confidence `low`/`medium` — משמש fallback כשאין מקור עירוני.

### C. (אופציונלי, שלב ב') `streetview_vision`
אם המשתמש מעוניין — נוסיף ניתוח תמונה של Street View עם Lovable AI לאימות חזותי. נדרש חיבור Google Maps connector.

---

## קבצים שישתנו

1. **`supabase/functions/lookup-plot-units/index.ts`**
   - הוספת `sourceTlvBuildings()` שקוראת לשכבת המבנים העירונית
   - הוספת `sourceOsmBuilding()` עם Overpass API
   - הרחבת `SourceName` ל-`"tlv_buildings" | "osm_building"`
   - עדכון `pickBest()` כך ש:
     - לקומות: עדיפות ל-`tlv_buildings` (מדידה פיזית) > `tlv_permits` > `nadlan` > `govmap_bldg`
     - ליח"ד: עדיפות ל-`tlv_buildings` (כשממולא) > `tlv_permits` (built) > `nadlan` > `tlv_permits` (approved)
   - הוספתן ל-Promise.all הקיים

2. **`src/components/PlotPicker.tsx`**
   - הצגת שני המקורות הנוספים בטבלת ה-diagnostics
   - באג'ים חדשים: "מבנה עירוני" (ירוק) / "OSM" (אפור)

ללא שינויי DB. הסכמה הקיימת (`sources_json` jsonb) קולטת את זה ללא שינוי.

---

## שאלה לפני מימוש

האם להתחיל מ-**A בלבד** (שכבת מבנים עירונית של ת"א — הכי מועיל, ממוקד), מ-**A + B** (כולל OSM fallback), או לכלול גם **C** (Street View vision)?
