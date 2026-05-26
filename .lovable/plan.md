## הבעיה

מקורות `nadlan` ו-`govmap_bldg` הקיימים מחזירים תוצאות חלקיות או ריקות. צריך מקור אמין יותר — עדיף ישירות מעיריית ת"א.

## הפתרון: שכבת היתרי בניה של עיריית ת"א

מצאתי שכבה ציבורית ב-ArcGIS REST של עיריית תל אביב:

`https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/772`
**שם:** "בקשות והיתרי בניה" (Feature Layer, פוליגון לכל בניין)

שדות רלוונטיים:
- `yechidot_diyur` (integer) — **מספר יחידות דיור מאושרות בהיתר**
- `building_stage` — "קיים היתר" / "בתהליך היתר" / "תעודת גמר" וכו'
- `permission_date`, `occupation`, `finished` — תאריכי היתר/אכלוס/גמר
- `addresses`, `ms_tik_binyan`, `building_num`
- `sw_tama_38*` — דגלים על תמ"א 38
- `shape` (Polygon, EPSG:2039 = ITM)

השכבה תומכת ב-`esriSpatialRelIntersects` ולא דורשת טוקן — כלומר אפשר לשלוח שאילתה מרחבית מה-edge function ולקבל בדיוק את ההיתרים שחותכים את החלקה.

מגבלה: כיסוי **ת"א-יפו בלבד**. לחלקות מחוץ לעיר נמשיך עם המקורות הקיימים.

## ארכיטקטורה

מוסיף מקור חדש `tlv_permits` ל-`lookup-plot-units` שירוץ במקביל לשאר:

```text
┌─ getParcelCentroidItm (כבר קיים) ──── x, y בITM ──┐
│                                                    │
├─ sourceNadlan (קיים)                              │
├─ sourceGovmapBldg (קיים)                          │
├─ sourceTlvPermits (חדש) ─────────────────────────┐│
│   1. נקודה + tolerance 5מ' → /772/query           ││
│      where=1=1, geometry=point, geometryType=     ││
│      esriGeometryPoint, inSR=2039, spatialRel=    ││
│      esriSpatialRelIntersects, outFields=*        ││
│   2. אם ריק: נסה buffer 15מ' (ENVELOPE)           ││
│   3. סנן: yechidot_diyur > 0                      ││
│   4. בחר את ההיתר הרלוונטי:                       ││
│      • עדיפות: יש occupation/finished → built     ││
│      • אחרת: latest permission_date               ││
│   5. חבר תמ"א 38 — אם sw_tama_38 פעיל, סמן בdetail││
└─ sourceHeuristic (fallback)                       │
                                                    │
              pickBest (עדיפויות מעודכנות):         │
              manual > tlv_permits(built) >         │
              nadlan > tlv_permits(approved) >      │
              govmap_bldg > heuristic               │
```

### Confidence Mapping למקור החדש
- `building_stage = "תעודת גמר"` או יש `occupation` → **high** (קיים בפועל)
- `building_stage = "קיים היתר"` עם `permission_date` → **medium-high**
- `building_stage = "בתהליך היתר"` → **medium** (מתוכנן, לא קיים עדיין)
- `yechidot_diyur = 0` → דלג (לרוב ייעוד לא-מגורים)

### תצוגה ב-PlotPicker (פאנל אבחון קיים)
שורה חדשה במקור: `עיריית ת"א - היתרים` עם:
- מספר יח"ד מההיתר
- תאריך היתר + שלב
- דגל "כולל תמ"א 38" אם רלוונטי
- כפתור Raw עם כל ההיתרים שנמצאו (לבדיקת מקרים של ריבוי היתרים על אותה חלקה)

## קבצים שישתנו

1. **`supabase/functions/lookup-plot-units/index.ts`**
   - הוספת `sourceTlvPermits(centroidItm)` עם 2 שלבי שאילתה (point → buffer).
   - עדכון `pickBest` לסדר עדיפות חדש.
   - החזרת `tlv_permits` ב-`sources_json`.

2. **`src/components/PlotPicker.tsx`**
   - תווית UI חדשה במפת המקורות: `tlv_permits → "עיריית ת"א - היתרים"`.
   - תג בעמודת detail להצגת `building_stage` + תאריך + תמ"א 38.

3. **`supabase/migrations/...sql`** — *לא נדרשת מיגרציה*; `sources_json` כבר jsonb גמיש ו-`source` כבר text.

## בדיקה ידנית

לאחר הפריסה:
1. ויצמן 33 (גוש 6111 חלקה 483) — נצפה לראות יח"ד מההיתר בפאנל.
2. כתובת מחוץ לת"א — `tlv_permits` יחזיר `empty` ונגזר ל-nadlan/govmap.
3. חלקה עם מספר היתרים — Raw אמור להציג את כולם, ה-best הוא הרלוונטי.

## סיכון / Edge cases

- חלקה עם כמה בניינים נפרדים: שאילתת point תתפוס רק אחד. ה-buffer 15מ' יתפוס בדרך כלל את כולם; נסכום `yechidot_diyur` ע"פ `ms_tik_binyan` (תיק בניין ייחודי).
- תמ"א 38 תוספת: ההיתר העדכני יכלול את **סה"כ** היחידות אחרי התוספת, אז זה כבר נכון.
- חלקה ללא היתר דיגיטלי (בניינים ישנים מ-1930s לפני שהמערכת תועדה) — יחזור `empty`, נופלים ל-nadlan/heuristic כרגיל.
