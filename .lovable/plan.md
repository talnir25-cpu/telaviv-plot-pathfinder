## הוספת תווית "סטטוס פיזי" לכל היתר בפאנל האבחון

### Edge function (`lookup-plot-units/index.ts`)

מוסיף בתוך `sourceTlvPermits` שדה `physicalStatus` לכל היתר ב-`raw.chosen`:

| תנאי | `physicalStatus` |
|---|---|
| `occupation` או `finished` מלא, או `building_stage` מכיל "תעודת גמר"/"אכלוס" | `"built"` (קיים בפועל) |
| `building_stage` מכיל "קיים היתר" | `"approved"` (מאושר, לא בהכרח נבנה) |
| `building_stage` מכיל "בתהליך" | `"in_process"` (בתהליך היתר) |
| אחר | `"unknown"` |

מסכם גם סיכומים ברמת המקור (לא חובה אבל שימושי):
- `raw.summary.builtUnits` — סכום `yechidot_diyur` של היתרים `built` בלבד
- `raw.summary.approvedUnits` — סכום של `approved`/`in_process`

### PlotPicker (`src/components/PlotPicker.tsx`)

ב-Dialog של ה-Raw, כשהמקור הוא `tlv_permits`, מציג טבלה מסודרת במקום JSON גולמי:

| בניין (תיק) | יח"ד | סטטוס | תאריך היתר | תמ"א 38 |
|---|---|---|---|---|
| 12345 | 8 | <span style="color:emerald">קיים בפועל</span> | 1998-04-12 | – |
| 12345 | 24 | <span style="color:amber">מאושר (לא נבנה)</span> | 2021-09-01 | חדש |

מיפוי תוויות:
- `built` → "קיים בפועל" (ירוק)
- `approved` → "מאושר - לא בהכרח נבנה" (צהוב)
- `in_process` → "בתהליך היתר" (כתום)
- `unknown` → "—" (אפור)

מעל הטבלה: שורה מסכמת — "בנוי בפועל: X · מאושר נוסף: Y".

JSON הגולמי המלא נשאר נגיש מתחת ב-`<details>` מקופל.

### קבצים שישתנו

1. `supabase/functions/lookup-plot-units/index.ts` — שדה `physicalStatus` + `summary`
2. `src/components/PlotPicker.tsx` — רכיב טבלה ב-Dialog הקיים כש-`source === "tlv_permits"`

ללא שינויי DB.
