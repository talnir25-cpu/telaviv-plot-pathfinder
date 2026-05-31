## מצב נוכחי (כבר קיים באפליקציה)

המנגנון לזיהוי **קומות + יחידות דיור קיימות** במגרש כבר מחובר במלואו:

**Backend** — `supabase/functions/lookup-plot-units/index.ts`:
- `govmap_bldg` — שכבת BUILDINGS של GovMap, מוציאה קומות מדודות פיזית (`high` confidence)
- `tlv_permits` — היתרי בנייה ת"א (FeatureServer 772), שדה `yechidot_diyur`
- `nadlan` — ספירת תת-חלקות מעסקאות נדל"ן (lower bound ליח"ד)
- `heuristic` — fallback
- Cache בטבלת `plot_units_cache` עם `confidence` ו-`sources_json`

**Frontend** — `src/components/PlotPicker.tsx`:
- קריאה אוטומטית ב-`useEffect` ברגע שנבחרה חלקה (שורה 221-235)
- מילוי שדות `existingUnits`, `existingFloors`, `existingBuiltArea`
- כפתור עריכה ידנית + שמירה ב-cache (`saveManualUnits`)
- תצוגת מקור + רמת אמינות + דיאלוג raw לכל מקור

## מה נעשה בפועל

### 1. אימות שהמנגנון עובד
- להריץ `lookup-plot-units` על 2-3 חלקות לדוגמה ברובע 3/4
- לבדוק שמקור `govmap_bldg` מחזיר `floors` עם `confidence: high`
- לבדוק את `edge_function_logs` לאיתור כשלים שקטים

### 2. תיעדוף GovMap לקומות (לפי בחירת המשתמש)
- בדיקת לוגיקת aggregation ב-`lookup-plot-units` — לוודא שכש-`govmap_bldg.floors` קיים עם `high`, הוא גובר על שאר המקורות עבור שדה הקומות (ייתכן ש-`tlv_permits` גובר כיום)
- אם נדרש — לעדכן עדיפויות כך ש-`floorsSource` יבוא מ-GovMap כשהוא זמין ומדויק

### 3. שיפורים קטנים (רק אם האימות יחשוף בעיות)
- הרחבת `mapTolerance` הדינמי אם מ