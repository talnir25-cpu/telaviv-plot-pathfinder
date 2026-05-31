# שלב 2.א — חישוב זכויות דטרמיניסטי לפי תקנוני הרבעים

מטרה: להחליף את ההערכה האקראית של `proposed.units` ו-`proposed.builtAreaSqm` בחישוב מבוסס תקנון, לפי הייעוד והמיקום של החלקה ברובע.

---

## 1. טבלת `zoning_rights`

טבלה חדשה ב-Supabase שמכילה את הזכויות לכל ייעוד בכל תכנית רובע.

שדות עיקריים:
- `id`, `plan_code` (תא/3616/א, תא/3729/א)
- `quarter` (3, 4)
- `zone_label` (מגורים א', מגורים ב', מגורים ג', מסחר, מגורים ומסחר וכו')
- `location_filter` jsonb — קריטריונים אופציונליים: `{ "area": "declaration" | "market_street" | "rest", "street": "..." }`
- `coverage_pct` — אחוז תכסית
- `max_far` — סך זכויות בנייה עיקריות (%)
- `max_floors_above` — מס' קומות מעל הקרקע
- `max_floors_roof` — חדרי גג / קומות נסוגות
- `density_coefficient_sqm_per_unit` — מ"ר/יח"ד (הליבה של החישוב)
- `min_unit_size_sqm`
- `setback_front_m`, `setback_side_m`, `setback_rear_m`
- `tama38_far_bonus`, `pinui_far_bonus`, `rova_plan_far_bonus`
- `tama38_units_bonus_pct`, `pinui_units_bonus_pct`
- `source_citation` — סעיף ועמוד בתקנון
- `notes`, `created_at`

RLS: קריאה פתוחה לכולם (כמו `plot_units_cache`). כתיבה רק ל-service_role (seed דרך migration).

GRANT: `SELECT` ל-`anon` ו-`authenticated`, `ALL` ל-`service_role`.

## 2. Seed הטבלה מהתקנונים

מילוי ידני של הטבלה ב-migration ראשוני, על בסיס שני ה-PDFs שכבר נותחו:
- **רבע 3 (תא/3616/א)**: ייעודי מגורים א'/ב'/ב' מיוחד/ג', מסחר, מגורים ומסחר — כל אחד עם מקדם הצפיפות (מ"ר/יח"ד), תכסית, קומות, נסיגות, וההבחנה בין "אזור הצהרה" לבין השאר.
- **רבע 4 (תא/3729/א)**: אותם ייעודים עם הערכים המעודכנים (128%-148% statutory, ערכי המקסימום החדשים שמחליפים אותם).

אם חסר ערך מפורש בתקנון לייעוד מסוים — נשמור `null` ונסמן `confidence: "missing"` ב-notes.

## 3. Edge function `lookup-zone-info`

קלט: `{ gush, helka, quarter?, street?, address? }`
פלט: `{ plan_code, zone_label, rights: {...}, source_citation, confidence }`

לוגיקה (ללא GIS):
1. אם המשתמש סיפק `quarter` ידנית — שימוש בו. אחרת, ניחוש לפי gush (טבלת mapping קצרה gush→quarter עבור gush-ים מוכרים ברבעים 3-4).
2. בחירת `plan_code` לפי quarter (3616 לרבע 3, 3729 לרבע 4).
3. אם המשתמש סיפק ייעוד ידנית (`zone_label_override`) — שימוש בו.
4. אחרת — החזרת ברירת מחדל "מגורים ג'" (השכיח ביותר) עם `confidence: "low"`, והבלטה ב-UI שצריך לאשר ידנית.
5. שליפת השורה המתאימה מ-`zoning_rights` והחזרתה.

`verify_jwt = false`, CORS תקין.

## 4. עדכון `analyze-plot` (או הפונקציה הקיימת שמחשבת `proposed`)

החלפת החישוב האקראי הנוכחי ב:

```text
zone = await lookupZoneInfo(gush, helka, ...)
far_bonus = zone[`${renewalTrack}_far_bonus`] ?? 0       // 0 / tama38 / pinui
units_bonus_pct = zone[`${renewalTrack}_units_bonus_pct`] ?? 0

effective_far = (zone.max_far + far_bonus) / 100
builtAreaSqm  = floor(plotAreaSqm * effective_far)

base_units    = floor(builtAreaSqm / zone.density_coefficient_sqm_per_unit)
proposed_units = floor(base_units * (1 + units_bonus_pct / 100))
```

הסרת ה-multipliers הקודמים (1.6× / 3.0×).
הוספה לפלט: `calculation_source: { plan_code, zone_label, section, density_coefficient, far, bonus_track }`.

## 5. UI ב-`DashboardReport`

- שורה חדשה: **"מקור החישוב"** — `תא/3616/א · מגורים ג' · סעיף X · מקדם צפיפות 65 מ"ר/יח"ד · בונוס תמ"א 38: +25%`
- אם `confidence === "low"`: באנר צהוב "ייעוד לא זוהה אוטומטית — אשר/שנה ידנית", עם dropdown לבחירת ייעוד מתוך הערכים הקיימים בטבלה לאותו רובע.
- אופציונלי: dropdown למסלול התחדשות (ללא בונוס / תמ"א 38 / פינוי-בינוי / תכנית רובע).

---

## פרטים טכניים

**קבצים שיושפעו:**
- `supabase/migrations/<timestamp>_zoning_rights.sql` — יצירת טבלה + GRANT + RLS + INSERT-ים ראשוניים מהתקנונים.
- `supabase/functions/lookup-zone-info/index.ts` — חדש.
- `supabase/functions/analyze-plot/index.ts` (או המקבילה) — שינוי `computeProposed`.
- `src/components/DashboardReport.tsx` (או המקבילה) — תצוגת מקור החישוב + dropdown ייעוד.
- `src/integrations/supabase/types.ts` — מתעדכן אוטומטית.

**מה לא נכלל בשלב הזה:**
- אינטגרציית GIS (ms_migrash → polygon → ייעוד). דחוי לשלב 2.ב.
- זיהוי אוטומטי של "אזור הצהרה" מול "שאר הרובע" לפי קואורדינטות — בינתיים ייקבע ידנית או דרך ניחוש לפי רחוב.

**הנחה מרכזית:** כל עוד אין GIS, הייעוד נקבע לפי input מהמשתמש או ברירת מחדל. החישוב עצמו דטרמיניסטי 100% — אם הייעוד נכון, התוצאה נכונה ומבוססת תקנון.
