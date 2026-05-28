# הסרת היתרי ת״א ועסקאות נדל״ן מחישוב השטח הבנוי

## מטרה
שטח בנוי קיים (`builtArea`) יוערך אך ורק ממקורות: `manual` → `govmap_bldg` (מדוד) → `heuristic`.
המקורות `tlv_permits` ו-`nadlan` ימשיכו לפעול ולתרום ל**יח״ד וקומות** וייוצגו בתצוגת המקורות — אך לא ייכנסו ל-`pickBestArea`.

## שינויים

### `supabase/functions/lookup-plot-units/index.ts`
ב-`pickBestArea` (סביבות שורות 789–815):
- להסיר את הבלוק שבוחר `tlv_permits` כמועמד `high`.
- להסיר את הבלוק שבוחר `nadlan` כמועמד `medium`.
- סדר עדיפויות חדש:
  1. `manual` (high)
  2. `govmap_bldg` עם קומות מדודות (high)
  3. `govmap_bldg` עם קומות מוערכות (medium)
  4. `heuristic` (low)
- לוודא ששדות ה-`totalFloorArea` של `tlv_permits` ו-`nadlan` ממשיכים להיכתב ל-`sources_json` לדיאגנוסטיקה, אבל לא נבחרים.

### ללא שינוי
- שאיבת היתרי ת״א ועסקאות נדל״ן עצמן — נשארות כי הן מזינות יח״ד/קומות.
- סכימת DB (`plot_units_cache`) — ללא מיגרציה.
- UI ב-`PlotPicker` ו-`DashboardReport` — ה-badge יציג אוטומטית את המקור החדש שנבחר (govmap/manual/heuristic).
- `analyze-plot` — ללא שינוי.

## אימות
לאחר הפריסה, להריץ `lookup-plot-units` על חלקה לדוגמה ולוודא ש-`builtAreaSource` הוא `govmap_bldg`/`manual`/`heuristic` בלבד, גם כשיש נתוני היתרים/נדל״ן זמינים.
