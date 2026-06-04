## הוספת "שלב 0 — נסח טאבו" כבסיס לבדיקה המקדימה

### מטרה
לאפשר למשתמש להעלות נסח טאבו (PDF) כצעד פותח. הקובץ ייקרא ע"י AI ויחלץ נתונים מובְנים שיזינו אוטומטית את שלב 1 (זיהוי החלקה) ושלב 2 (המצב הקיים), עם רמת אמון של "מאומת מנסח טאבו" שתגבר על הערכות אוטומטיות (`nadlan`, `govmap_bldg`, `heuristic`) — אך תישאר ניתנת לעריכה ידנית.

### חוויית משתמש
ב-`PlotPicker.tsx`, מעל "שלב 1", מתווסף בלוק חדש:

```text
┌─ שלב 0 · נסח טאבו (מומלץ) ────────────────────┐
│  [⤴ העלה נסח טאבו PDF]   [או דלג להזנה ידנית] │
│  סטטוס: מנתח… / נקראו N שדות / שגיאה          │
│  סיכום שחולץ:                                   │
│   • גוש 6953 · חלקה 120 · רובע 4 (זוהה)        │
│   • שטח רשום: 720 מ"ר                           │
│   • 6 בעלים רשומים · 2 משכנתאות · 1 הערת אזהרה │
│   [ערוך נתונים]  [נקה]                          │
└─────────────────────────────────────────────────┘
```

לאחר פרסור מוצלח: שדות שלב 1 ו-2 ממולאים אוטומטית, ולצדם תג חדש "מנסח טאבו" (מקור `tabu` בעדיפות אחרי `manual` ולפני `nadlan`). ההערות המשפטיות (בעלים, משכנתאות, הערות אזהרה, עיקולים) זורמות לדוח כסקציה חדשה "מצב משפטי" עם דגלי סיכון.

### זרימת עיבוד (Workflow)

```text
PDF upload
   │
   ▼
Storage bucket (tabu-extracts, private)  ──► חתימה זמנית
   │
   ▼
Edge function: parse-tabu
   │  1. document parse (OCR אם צריך) → טקסט גולמי + טבלאות
   │  2. AI extraction (Lovable AI Gateway, google/gemini-2.5-pro, tool-call עם schema)
   │  3. ולידציה (Zod) + נרמול שדות
   │  4. כתיבת קאש ב-tabu_extracts (לפי hash של הקובץ)
   ▼
JSON מובנה חוזר ל-PlotPicker
   │
   ├─► prefill: quarter / gush / helka / area
   ├─► prefill שלב 2: builtArea / units / floors / yearBuilt (כשקיים)
   ├─► legal: owners[], mortgages[], cautionaryNotes[], liens[]
   └─► שמירה ב-tabu_extracts כדי שלא יפורסר שוב באותו פרויקט
```

### שדות שמחולצים מהנסח
- **זיהוי**: גוש, חלקה, תת-חלקה (אם יש), כתובת, רובע משוער.
- **שטח**: שטח רשום של החלקה (מ"ר).
- **בנייה רשומה**: שטח בנוי רשום, מס' יח"ד, מס' קומות, שנת רישום ראשונה (כשמופיע ברישום הבית המשותף).
- **בעלות**: רשימת בעלים + שיעור חלק ברכוש המשותף → נגזר אחוז בעלים בעד פרויקט (קריטי לרף 67%/80% להתחדשות עירונית).
- **שעבודים**: משכנתאות, עיקולים, הערות אזהרה, זיקות הנאה, הגבלות סחירות.
- **בית משותף**: האם רשום כבית משותף + מספר תיק.

### השפעה על הדוח
- KPI חדש בכותרת: "כשירות לפינוי-בינוי" עם אחוז בעלים מאומת מהטאבו (במקום הערכה).
- סקציית "מצב משפטי" חדשה ב-`DashboardReport` שמציגה דגלי סיכון (עיקול → אדום, הערת אזהרה לטובת צד ג' → כתום, משכנתא רגילה → ניטרלי).
- במקור הנתונים בשלב 2 — שורה חדשה "נסח טאבו" עם אייקון מאומת ועדיפות 2 (אחרי manual).

### שינויים בקוד

**Frontend** (`src/components/PlotPicker.tsx`):
- בלוק חדש מעל שלב 1 עם input file + מצב upload/parsing/done/error.
- type `UnitsSource` מתרחב ל-`"tabu"`; `SOURCE_META.tabu = { label: "נסח טאבו", icon: FileCheck2, tone: "text-primary" }`.
- פונקציית `handleTabuUpload` קוראת ל-edge `parse-tabu`, ועל הצלחה מבצעת `setQuarter/setGushQuery/setHelka` ושומרת את הנתונים החוקיים ב-state חדש `tabuData` שמועבר ל-`onAnalyze`.

**Type** (`src/types/feasibility.ts`):
- הרחבת `AnalysisInput` עם שדה אופציונלי `tabu?: TabuExtract` (סכמת בעלים/שעבודים/שטח רשום).

**Backend**:
- Storage bucket חדש `tabu-extracts` (private, RLS לפי owner).
- טבלה חדשה `tabu_extracts` (`id, file_hash unique, gush, helka, raw_json, created_at`) + GRANT + RLS.
- Edge function חדשה `supabase/functions/parse-tabu/index.ts`:
  - מקבל `{ storagePath }` או `{ fileBase64 }`.
  - מחשב SHA-256 → אם קיים בקאש, מחזיר מיד.
  - מוריד מ-storage → `pdf-parse`/OCR לפי תוכן → שולח טקסט ל-Lovable AI עם tool-call schema קשיח (Zod) → מאמת → שומר → מחזיר JSON.
- `supabase/functions/lookup-plot-units/index.ts`: הוספת `tabu` כמקור עם עדיפות 2 ב-`pickBest` (אחרי manual, לפני nadlan) — רק כשהקליינט מעביר את הערך כפרמטר.

**Dashboard** (`src/components/DashboardReport.tsx`):
- סקציית "מצב משפטי" חדשה שמוצגת ר