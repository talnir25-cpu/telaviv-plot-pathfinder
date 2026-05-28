
# שילוב תכסית בניתוח ובדוח

מטרה: להפוך את התכסית מנתון תצוגתי בטופס לאילוץ פעיל שמשפיע על המלצות ה-AI, מאומת אחרי החזרת הדוח, ומציג תובנת ניצול ליזם.

## 1. העברת התכסית ל-edge function (`analyze-plot/index.ts`)

הרחבת `PlotInput` ב-4 שדות אופציונליים:
```text
frontSetbackM, sideSetbackM, rearSetbackM, setbackSource
```

### חישוב שטח קומה מירבי ב-edge

לפני שליחת ה-prompt — חישוב דטרמיניסטי (העתק מ-`src/lib/setback-standards.ts`, פונקציה זהה):
```text
typicalFloorArea = (√plotArea − 2·side) × (√plotArea − front − rear)
```

### הזרקה ל-prompt כאילוץ מחייב

תוספת ל-`userPrompt`:
```text
קווי בניין (מקור: {regulation | משתמש}):
  קדמי X / צדדי Y / אחורי Z מ׳
שטח קומה טיפוסי מירבי: ~N מ״ר (תכסית ~K%)

אילוץ קשיח: proposed.builtAreaSqm ≤ N × proposed.floors
אם FAR שאיפתי דורש יותר — הגדל את floors (עד maxFloors) ולא את השטח לקומה.
```

ה-AI מקבל את הנתון, אבל **לא סומכים** עליו — הוולידציה למטה.

## 2. Post-validation דטרמיניסטית (אחרי תשובת ה-AI)

בבלוק `post-validation` הקיים, חישוב חדש:
```text
floorsNeeded = ceil(proposed.builtAreaSqm / typicalFloorArea)
```

### חוקי החלטה

| מצב | פעולה |
|---|---|
| `floorsNeeded ≤ proposed.floors` | OK — שום שינוי |
| `floorsNeeded > proposed.floors` אבל `≤ maxFloors` | RedFlag **warning**: "התכנון לא ריאלי גיאומטרית — נדרשות N קומות לתמיכה בשטח המוצע" |
| `floorsNeeded > maxFloors` | RedFlag **critical** + `status = "blocked"`: "התכסית לא מאפשרת את ה-FAR בהינתן מגבלת הקומות (נדרשות N, מקסימום M)" |
| `proposed.floors > floorsNeeded × 1.5` | אזהרה **info**: ניצול חסר של תכסית — אפשר להקטין קומות |

כל בדיקה מוסיפה `source: "בדיקת תכסית — קווי בניין {plan}, {section}"`.

## 3. הרחבת ה-schema של הדוח (`FinancialReport.zoning` → לא, `FeasibilityReport.zoning`)

הוספת 3 שדות אופציונליים ל-`zoning` ב-`src/types/feasibility.ts`:
```text
typicalFloorAreaSqm?: number      // שטח קומה מחושב מקווי הבניין
coveragePct?: number              // אחוז התכסית האפקטיבי
floorsNeededForFAR?: number       // קומות נדרשות לתמיכה ב-proposed.builtAreaSqm
```

ה-edge function ממלא אותם **אחרי** ה-AI (לא ב-tool schema — דטרמיניסטי בלבד).

## 4. תצוגה בדוח — `DashboardReport.tsx`, כרטיס "תכנון ובינוי"

הוספת בלוק קטן מתחת לשורת קווי הבניין (לפני העצים/חניה):

```text
┌─ תכסית וניצול ──────────────────────────────┐
│ שטח קומה טיפוסי:    340 מ״ר (49% תכסית)    │
│ קומות נדרשות ל-FAR: 12 / מוצע: 14   ✓      │
└──────────────────────────────────────────────┘
```

אייקון סטטוס בקצה השורה:
- ✓ ירוק — תכנון ריאלי
- ⚠ צהוב — חוסר התאמה (warning RedFlag כבר נוסף)
- ✕ אדום — בלתי אפשרי (status=blocked)

הבלוק מוצג רק אם `zoning.typicalFloorAreaSqm` קיים (תאימות אחורה לדוחות ישנים).

## 5. מה לא בתוכנית הזו

- שינוי לוגיקת תחשיב פיננסי (תוספת עלות לפי height premium אם נדרשות יותר קומות) — שלב נפרד.
- שילוב גיאומטריה אמיתית של מגרש (Polygon מ-GIS במקום הנחת מלבן).
- המלצות אקטיביות מסוג "הוסף קומה כדי להגיע ליעד" (Layer 3 מהדיון).

## פרטים טכניים

- **קבצים שיתעדכנו**:
  - `supabase/functions/analyze-plot/index.ts` — קבלת setbacks, חישוב typicalFloorArea, הזרקה ל-prompt, post-validation, אכלוס שדות חדשים ב-zoning.
  - `src/types/feasibility.ts` — הוספת 3 שדות אופציונליים ל-`zoning`.
  - `src/components/DashboardReport.tsx` — בלוק תצוגה חדש בכרטיס Zoning.
- **קבצים חדשים**: אין. הפונקציה `estimateTypicalFloorArea` תועתק ל-edge function (Deno לא יכול לייבא מ-`src/`).
- **DB**: אין שינויים.
- **תאימות אחורה**: כל השדות אופציונליים; דוחות ישנים ב-cache ימשיכו לעבוד.
- **ולידציה**: אם setbacks לא הועברו (קריאה ישנה) — מדלגים על כל הבלוק, אין שינוי התנהגות.
