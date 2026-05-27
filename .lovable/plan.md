
## מצב קיים

כיום `existing.builtAreaSqm` מחושב על ידי ה-AI (`analyze-plot`) בהערכה גסה — בעיקר `existingUnits × ~80-100 מ"ר`. אין שאיבה ישירה של שטח בנוי ממקורות רשמיים. ב-`lookup-plot-units` כבר נשאבים נתונים מ-GovMap BUILDINGS, היתרי ת"א ועסקאות נדל"ן — אבל **שטח הבניין הקיים בפועל** לא נשמר ולא מוזרם הלאה ל-`analyze-plot`.

המטרה: להפוך את `existingBuiltAreaSqm` משדה משוער ל-**שדה מדוד**, עם מקור ורמת אמינות, בדיוק כמו שעשינו ליח״ד וקומות.

---

## שלב 1 — שאיבת שטח בנוי ממקורות קיימים (`lookup-plot-units`)

הרחבת המקורות שכבר רצים, להחזיר גם `totalFloorArea` אמין:

1. **TLV permits (עיריית ת"א — שכבה 772)** — המקור הסמכותי ביותר.
   - להוסיף לשאילתה את שדות `shetach_eikari` (שטח עיקרי), `shetach_sherut` (שטח שירות), `shetach_kolel` (סה"כ).
   - אם יש מספר היתרים, לבחור את האחרון לפי `tlvStageRank` (כמו שכבר עושים ליח״ד).
   - confidence = **high**.

2. **GovMap BUILDINGS** — כבר מחושב `totalFloorArea = footprint × floors` אבל לא נשמר במאגרגייטור.
   - לשאוב גם שדות נוספים מהשכבה: `BLDG_AREA`, `TOTAL_AREA`, `Shape__Area` (טביעת רגל אמיתית במקום ההערכה `plotArea × 0.4`).
   - confidence = **high** כשיש קומות מדודות; **medium** עם טביעת רגל בלבד; **low** כשהכל סינתטי.

3. **שכבת חלקות עיריית ת"א (שכבה 514 או דומה)** — לעיתים כוללת `built_area` ברמת חלקה. לבדוק זמינות.

4. **נדל"ן** — לסכום `assetArea` של תת-חלקות ייחודיות כקצה תחתון נוסף (confidence = low, כי מכסה רק דירות שנמכרו).

5. **Heuristic fallback** — `existingUnits × 85` (אם הוזן ידנית) או `plotArea × FAR_מקומי טיפוסי`.

**מבנה החזרה חדש מ-`lookup-plot-units`:**
```ts
{
  units, floors, source, confidence,                 // קיים
  builtArea: number | null,                          // חדש
  builtAreaSource: SourceName | null,                // חדש
  builtAreaConfidence: Confidence | null,            // חדש
  sources: SourceResult[]                            // כל מקור יחזיר גם totalFloorArea
}
```

ה-aggregator יבחר את ה-`builtArea` ברמת אמינות הגבוהה ביותר (היתרי ת"א > GovMap מדוד > נדל"ן > heuristic), בדיוק כמו שעושה ליח״ד.

---

## שלב 2 — הזרמה לטופס וקלט הניתוח (`PlotPicker.tsx`)

- הוספת שדה `existingBuiltArea` ל-state, מאוכלס אוטומטית מהתוצאה.
- תווית עם badge מקור + אמינות (אותו דפוס שכבר קיים ליח״ד וקומות).
- מצב manual override + כפתור שמירה (כמו `saveManualUnits`).
- שמירה ל-DB כדי שתשמש משתמשים עתידיים (להוסיף עמודות `built_area`, `built_area_source`, `built_area_confidence` ל-`plot_units_cache` במיגרציה).

---

## שלב 3 — העברה ל-edge function ושימוש בחישוב

- הוספת `existingBuiltAreaSqm?: number` ו-`existingBuiltAreaSource?: string` ל-`AnalysisInput` ב-`src/types/feasibility.ts`.
- ב-`analyze-plot/index.ts`:
  - אם הוזן ערך מדוד — להעביר אותו ל-AI כעובדה קשיחה ולציין במפורש "השתמש בשדה הזה כ-`existing.builtAreaSqm` ואל תאמוד בעצמך".
  - אחרי קבלת הדוח, לדרוס את `report.existing.builtAreaSqm` אם הערך החיצוני קיים (post-validation דטרמיניסטי).
  - ב-`addition_only` הזרמת הערך הזה למנוע הפיננסי כ-`input.existingBuiltAreaSqm` — היום השדה כבר מנוצל ב-`finance-engine.ts` אבל מסתמך על ערך מהאומדן של ה-AI.

---

## שלב 4 — תצוגה ב-`DashboardReport.tsx`

- ליד "שטח בנוי קיים" להוסיף badge עם המקור (היתר ת"א / GovMap / הערכה).
- אייקון אזהרה כשהמקור הוא heuristic, כי כל תחשיב Tama 38 וכל עלות חיזוק תלויים במספר הזה.

---

## פרטים טכניים

| קובץ | שינוי |
|------|-------|
| `supabase/functions/lookup-plot-units/index.ts` | להוסיף שאיבת `shetach_kolel/eikari/sherut` בהיתרי ת"א, שדות שטח נוספים ב-GovMap BUILDINGS, סיכום `assetArea` בנדל"ן, ושדה `builtArea` ב-aggregator. |
| מיגרציה ל-`plot_units_cache` | הוספת `built_area numeric`, `built_area_source text`, `built_area_confidence text`. |
| `src/types/feasibility.ts` | `AnalysisInput.existingBuiltAreaSqm?: number` + `existingBuiltAreaSource?: string`. |
| `src/components/PlotPicker.tsx` | state + שדה קלט + badge מקור + override ידני + העברה ב-submit. |
| `supabase/functions/analyze-plot/index.ts` | הזרמת הערך לפרומפט + override ב-post-validation. |
| `src/components/DashboardReport.tsx` | badge מקור ליד שטח קיים. |

---

## מה לא בתכנית

- שאיבת מפ"א/תיק בניין סרוקים מתיק מהנדס העיר (דורש OCR ידני / API לא ציבורי).
- חישוב נפרד של שטח עיקרי מול שטח שירות לחישובי מס שבח — אפשר להוסיף בעתיד אם נדרש.

נדרש אישור לפני יישום.
