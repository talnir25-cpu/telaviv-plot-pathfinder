
## מטרה

בתכנית הרבעית (rova_plan) חישוב הזכויות בפועל מבוסס על **תכסית מותרת × מספר קומות**, ותקרת ה-FAR אינה רלוונטית. כיום הלוגיקה לוקחת `min(byFAR, byCoverage)` — מה שעלול להגביל מלאכותית את התוצאה כאשר ה-FAR נמוך מהמכפלה. נסיר את חסם ה-FAR במסלול הזה בלבד, נשמר אותו כפולבק במצב חוסר נתון תכסית, ונשאיר את שאר המסלולים (local_renewal, pinui_binui) ללא שינוי.

## שינוי בקוד

קובץ יחיד: `supabase/functions/analyze-plot/index.ts`, פונקציית החישוב המבוססת-תקנון (סביב שורות 770–896).

### לוגיקה חדשה
```text
אם renewalTrack == "rova_plan":
    אם יש coveragePct תקין ו-maxFloorsDet > 0:
        proposedBuilt = byCoverage           // FAR מתעלמים ממנו
        limitingFactor = "coverage"
    אחרת:
        proposedBuilt = byFAR                // פולבק יחיד כשאין תכסית
        limitingFactor = "far_fallback_no_coverage"
        // red-flag info: "תכסית חסרה בתקנון — שימוש ב-FAR כפולבק"
אחרת (שאר המסלולים):
    proposedBuilt = min(byFAR, byCoverage)   // התנהגות קיימת
    limitingFactor = byCoverage < byFAR ? "coverage" : "far"
```

### עדכונים נלווים באותו בלוק
- `calcSource.built_area_limiting_factor` יקבל את הערך החדש (`coverage` / `far` / `far_fallback_no_coverage`).
- הדגל הקיים "בדיקת תקרת תכסית לא בוצעה" (שורות ~791–798) יוצג רק אם **המסלול אינו rova_plan**, או יוחלף בדגל הפולבק החדש כשמדובר ב-rova_plan, כדי שלא יופיעו שני אזהרות סותרות.
- שאר השדות ב-`calcSource` (`base_far_pct`, `far_bonus_pct`, `effective_far_pct`) נשארים — הם דיווחיים בלבד ומוצגים ב-UI; הם לא משפיעים על החישוב במסלול רובעי לאחר השינוי.

### מה לא משתנה
- מסלול ה-fallback של "שטח ורובע" (כשאין `zoning_rights`) — אין שם הבחנה לפי track וממשיך עם `min(byFAR, byEnvelope)`.
- ולידציית התכסית הגיאומטרית מול קווי בניין (שורות ~638–705) — נשארת כפי שהיא; זה בודק האם השטח המוצע ניתן למימוש פיזי בקווי הבניין, בלי קשר ל-FAR החוקי.
- שכבת ה-UI (`DashboardReport.tsx`, `ReportArtifact.tsx`) — ממשיכה להציג FAR מקס׳ כפרמטר רגולטורי לידיעה. אופציונלית ניתן להוסיף תווית "לא חוסם — מסלול רובעי" ליד ערך ה-FAR; לא כלול בשינוי הזה אלא אם תרצה.

## בדיקה (לאחר היישום)

1. הרצת `analyze-plot` על מגרש ברובע 3/4 עם תכסית נמוכה × קומות גבוהות מ-FAR → לוודא ש-`proposed.builtAreaSqm` שווה ל-byCoverage ולא ל-byFAR.
2. הרצה על מגרש שבו `max_coverage_pct` חסר ב-DB → לוודא חזרה ל-byFAR + הופעת ה-info flag החדש.
3. הרצה במסלול `local_renewal` או `pinui_binui` → לוודא שהתנהגות נשארה `min(byFAR, byCoverage)`.
