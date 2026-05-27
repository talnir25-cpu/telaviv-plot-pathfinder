# תוכנית שיפור — analyze-plot, financial-analysis, lookup-plot-units

מטרה: לשפר איכות ודיוק **בלי להוסיף ספק AI חיצוני** (נשאר על Lovable AI). שני צירים: (1) שדרוג מודל, (2) שיפור פרומפטים ולוגיקה דטרמיניסטית.

---

## שלב 1 — שדרוג מודלים (החלפת מחרוזת אחת בכל קובץ)

| Function | מודל נוכחי | מודל חדש | סיבה |
|---|---|---|---|
| `analyze-plot` | `gemini-3-flash-preview` | **`google/gemini-3.1-pro-preview`** | ניתוח תקנוני/רגולטורי דורש הסקה עמוקה; pro מזהה דגלים אדומים טוב יותר |
| `financial-analysis` | `gemini-3-flash-preview` | **`openai/gpt-5.4`** | חישובים מרובי-שלבים + רגישות 3×3 — gpt-5.4 חזק במתמטיקה ועקביות מספרית |
| `lookup-plot-units` (אם קיים שם קריאת AI — לבדיקה) | — | נשאר flash, או עובר ל-`gemini-3.1-flash-lite-preview` | פונקציה דטרמיניסטית בעיקרה; AI רק לסיווג טקסט היתרים |

עלות: pro/gpt-5.4 יקרים פי ~5-10 מ-flash, אבל זה ריצה אחת לכל ניתוח (לא loop) — סביר לחלוטין.

---

## שלב 2 — שיפור `analyze-plot`

**א. חיזוק System Prompt:**
- להוסיף טבלת תקדים: "ברובע 3 דרום הים (גושים 6111, 6112) — מגבלת גובה 27 מ׳ קשיחה; ברובע 4 צפון (גושים 6213+) — עד 35 מ׳".
- להוסיף כלל אקטיבי: **"אם existingFloors ≥ 5 — תמ"א 38/2 לא משתלמת; הצע פינוי-בינוי בלבד וסמן `high_risk` אם המגרש < 800 מ"ר"**.
- להוסיף בדיקת עקביות: "אם treesForConservation > 0 וגם מגרש פינתי — הוסף red flag `warning` על קושי בתכנון מעטפת".

**ב. ולידציה דטרמיניסטית אחרי תשובת AI** (בקוד, לא בפרומפט):
- אם `proposed.units / existing.units > 4.5` — להוסיף אוטומטית red flag `warning` ("מכפיל חריג — דורש אישור ועדה מיוחד").
- אם `proposed.floors > zoning.maxFloors` — להחזיר 422 עם הודעה ("התוצאה לא עקבית עם תקנון הרובע").
- אם `existingUnits === 0` — לדחות בקשה ב-400 (לא ניתן לחשב מכפיל).

---

## שלב 3 — שיפור `financial-analysis`

**א. חישוב דטרמיניסטי + AI לאימות בלבד** (השינוי המהותי):

במקום לתת ל-AI לחשב 11 שלבים מתמטיים (מה שגורם לסטיות), נחשב בקוד:
```ts
// בקוד ה-edge function — לפני קריאת AI
const totalRevenue = sellableArea * pricePerSqm;
const netRevenue = totalRevenue / (1 + vatPct/100);
const hardCosts = builtArea * buildCostPerSqm;
// ... כל 11 הנוסחאות
const sensitivity = buildSensitivityGrid(...); // 9 תאים, נוסחה דטרמיניסטית
```

ואז שולחים ל-AI **רק**:
- `verdict` (profitable/marginal/loss) — סיווג סובייקטיבי
- `headline` ו-`notes` — טקסט בעברית
- `verdictLabel`

יתרון: 0 טעויות חישוב, AI עושה רק מה שהוא טוב בו.

**ב. תיקון נוסחת מימון:**
הנוסחה הנוכחית (`(totalCost - equity) × halfPeriod × rate`) מתעלמת מ-S-curve של משיכות. תיקון פשוט:
```ts
financingCosts = (totalCost - equity) * (constructionMonths/12) * (rate/100) * 0.55;
// 0.55 = ממוצע משוקלל לפי S-curve במקום 0.5
```

**ג. הוספת בדיקת sanity:**
- אם `breakevenPricePerSqm > avgSalePricePerSqm × 0.95` — הוסף ל-notes התראה.
- אם `developerProfit < 0` ו-verdict ≠ "loss" — תקן ל-loss.

---

## שלב 4 — שיפור `lookup-plot-units`

הוא כבר ברובו דטרמיניסטי (GovMap/Tel-Aviv permits). השיפורים:

**א. שיפור סיווג היתרים (אם יש שם AI):**
לוודא שה-prompt לסיווג `built` vs `approved` vs `in_process` מבוסס על שדות **מפורשים** ולא רק טקסט חופשי. לבדוק שהשדה `permit_status` מ-API ת"א נקרא ולא רק התיאור.

**ב. שיפור heuristic fallback:**
הנוסחה הנוכחית (8 יח"ד fallback) גנרית מדי. שיפור:
```ts
heuristicUnits = Math.round(plotArea / 80) * estimatedFloors;
// כאשר estimatedFloors = clamp(round(plotArea/200), 3, 8)
```

**ג. הוספת מקור שלישי — Nadlan.gov.il:**
API ציבורי של רשות המסים מחזיר עסקאות לפי חלקה — אפשר לגזור משם מספר יח"ד מינימלי (כל יח"ד שנמכרה אי-פעם).

---

## קבצים שישתנו

- `supabase/functions/analyze-plot/index.ts` — מודל + system prompt + ולידציה
- `supabase/functions/financial-analysis/index.ts` — מודל + העברת חישוב לקוד + AI רק לטקסט
- `supabase/functions/lookup-plot-units/index.ts` — heuristic + (אופציונלי) Nadlan

## פרטים טכניים

- כל ה-edge functions נפרסים אוטומטית אחרי השינוי.
- אין שינוי ב-DB schema, אין secrets חדשים, אין שינוי ב-UI.
- בדיקה: להריץ שוב על חלקה 6111/482 ולוודא שהמספרים יציבים בין 3 הרצות (כרגע משתנים).

## שאלה לפני יישום

- האם להחיל את **שלב 3.א** (העברת כל החישוב הפיננסי לקוד) — שינוי המהותי שייתן את שיפור הדיוק הגדול ביותר? או להשאיר את ה-AI כמחשב ורק לחזק את הפרומפט?
