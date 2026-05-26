## מטרה

להחליף את ה-`lookup-plot-units` הנוכחי (שנופל כמעט תמיד ל-`estimate`) במנגנון רציני שמושך נתונים משלושה מקורות עצמאיים, מצליב ביניהם, מציג רמת ביטחון, ומאפשר אבחון שקוף של כל מקור.

## ארכיטקטורה

```
PlotPicker
   │
   ▼
lookup-plot-units (edge function, parallel fan-out)
   │
   ├─► Source A: Nadlan transactions  (nadlan.gov.il)
   │       └─ סופר דירות ייחודיות שנמכרו בכתובת
   │
   ├─► Source B: TLV Open Data        (data.tel-aviv.gov.il)
   │       ├─ שכבת מבנים (קומות + שטח)
   │       └─ שכבת ארנונה (אם זמין לפי גוש/חלקה)
   │
   ├─► Source C: GovMap BLDG          (ags.govmap.gov.il)
   │       └─ Polygon-intersect מול מעטפת החלקה
   │
   └─► Aggregator → בוחר ערך + confidence + רושם לכל מקור
                    │
                    ▼
              plot_units_cache  (כולל היסטוריה לכל מקור)
```

## שינויי בקאנד

### 1. `supabase/functions/lookup-plot-units/index.ts` — שכתוב

מבנה חדש: כל מקור הוא פונקציה אסינכרונית שמחזירה אובייקט `SourceResult`:

```ts
type SourceResult = {
  source: "nadlan" | "tlv_buildings" | "tlv_arnona" | "govmap_bldg" | "heuristic";
  units: number | null;
  floors: number | null;
  totalFloorArea: number | null;
  raw: unknown;          // raw response snippet for debug
  status: "ok" | "empty" | "error" | "skipped";
  errorMsg?: string;
  durationMs: number;
};
```

ה-handler יריץ את כל המקורות ב-`Promise.allSettled`, יחזיר `sources: SourceResult[]` + שדה מאוחד `best: { units, floors, source, confidence }`.

**שיטות שליפה לכל מקור:**

- **Nadlan**: POST ל-`nadlan.gov.il/Nadlan.REST/Main/GetAssestAndDeals` עם `Gush`/`Parcel`. סופר `dealNature` / מספרי דירה ייחודיים → רף תחתון של יח״ד (כי לא כל דירה נמכרה).
- **TLV Buildings**: ArcGIS REST של עיריית ת״א — `services1.tlv.gov.il/.../Buildings/FeatureServer/0/query?where=GUSH=X AND HELKA=Y&outFields=NumberOfFloors,NumberOfApartments,...`. כשיש שדה `NumberOfApartments` — זה ה-ground truth.
- **TLV Arnona**: בדיקת data.tel-aviv.gov.il לסט נכסי ארנונה לפי גוש/חלקה. אם קיים → ספירת רשומות נפרדות = יח״ד.
- **GovMap BLDG (משופר)**: במקום Identify בנקודה, להשתמש ב-`FindParcels` → קבלת polygon → `QueryFeatures` על שכבת `BUILDINGS` עם פילטר `ST_Intersects`.
- **Heuristic**: כפי שהיום (fallback אחרון).

**Aggregator (`pickBest`)**: סדר עדיפות לפי `confidence`:
1. `tlv_buildings` אם מחזיר `NumberOfApartments` ישיר → confidence `high`
2. `tlv_arnona` → `high`
3. `nadlan` → `medium` (רף תחתון; מוצג כ-"לפחות N")
4. `govmap_bldg` (footprint×floors÷80) → `low`
5. `heuristic` → `very_low`

הקאש (`plot_units_cache`) ירחיב כדי לשמור JSON של כל המקורות לצרכי דיבאג והיסטוריה. ה-TTL נשאר ידני (המשתמש לוחץ "רענן").

### 2. מיגרציית DB

הוספת עמודות ל-`plot_units_cache`:
- `sources_json jsonb` — מערך SourceResult המקורי
- `confidence text` — `high`/`medium`/`low`/`very_low`
- `last_refreshed_at timestamptz default now()`

## שינויי פרונט

### 3. `PlotPicker.tsx` — תוספת פאנל אבחון

מתחת לבאדג׳ "מאומת ידנית / GovMap / הערכה" יתווסף כפתור קטן **"מקורות נתונים (N/M הצליחו)"**. בלחיצה — פותח Collapsible עם טבלה:

| מקור | סטטוס | יח״ד | קומות | זמן (ms) | פעולות |
|---|---|---|---|---|---|
| נדל"ן.gov | ✓ | ≥6 | — | 420 | [Raw] |
| מבני ת"א | ✓ | 8 | 3 | 180 | [Raw] |
| ארנונה ת"א | — | — | — | 90 | [Raw] |
| GovMap BLDG | ✗ timeout | — | — | 5000 | [Raw] |
| Heuristic | ✓ | 8 | 3 | 1 | — |

- צבעי סטטוס מ-design tokens (success/warning/destructive).
- כפתור **[Raw]** פותח Dialog עם JSON pretty-printed (לעריכה ידנית ע