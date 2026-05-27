## תכנית: כרטיס ויזואלי של רווח יזמי (ROC) מול רף המטרה

### מטרה
להדגיש בדוח הפיננסי את אחוז הרווח היזמי (ROC — Return on Cost) ולהציגו לעין בצורה ויזואלית, עם השוואה מול רף הרווח המבוקש שהמשתמש הגדיר.

### מה קיים כיום
- ב-`FinancialReport` יש שדות `rocPct`, `rosPct`, `irrPct`, וגם `verdict` (profitable/marginal/loss)
- ב-`FinancialInput` קיים `targetDeveloperProfitPct`
- ב-`FinancialReportCard` אחוז ה-ROC מוצג כטקסט יבש בלבד (KPI פשוט)

### מה נבנה

#### 1. שינוי ב-FinancialReport type
הוספת שדה `targetProfitPct` ל-`FinancialReport` כדי שהדוח יכלול גם את רף המטרה (מועבר מהקלט) — נדרש להצגת השוואה.

#### 2. עדכון edge function (`financial-analysis`)
החזרת `targetProfitPct` בתשובת ה-`analyze` מבוסס על `input.targetDeveloperProfitPct` שהתקבל.

#### 3. רכיב ProfitGauge חדש ב-FinancialAnalysis.tsx
- כרטיס גדול ומרכזי בראש תוצאות הדוח (מעל הקיימים)
- בר התקדמות (progress bar) המשווה `rocPct` מול `targetProfitPct`
- צבע דינמי: ירוק מעל הרף, צהוב סמוך, אדום מתחת
- מספרים גדולים: ROC מציאותי | רף המטרה | פער (±)
- אייקון ותווית לפי ה-verdict הקיים

#### 4. עיצוב
- שימוש בטוקנים סמנטיים קיימים: `success`, `warning`, `danger` בהתאם למצב
- ללא צבעים ישירים — הכל דרך המערכת
- RTL מלא (עברית)

### קבצים לשינוי
| קובץ | שינוי |
|------|-------|
| `src/types/feasibility.ts` | הוספת `targetProfitPct` ל-`FinancialReport` |
| `supabase/functions/financial-analysis/index.ts` | החזרת `targetProfitPct` בתשובת analyze |
| `src/components/FinancialAnalysis.tsx` | רכיב `ProfitGauge` חדש + שילובו ב-`FinancialReportCard` |

### איך זה נראה
```
┌─────────────────────────────────────────────┐
│  [TrendingUp] רווח יזמי (ROC)               │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  ████████████░░░░░░░░░░░░░░░░░░░░░░░░ │   │  ← bar: roc vs target
│  11.4%           ← רף: 15% →         │   │
│                                             │
│  פחות 3.6% מהרף המבוקש    │ סיכון גבוה │   │
└─────────────────────────────────────────────┘
```