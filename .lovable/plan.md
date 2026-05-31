## עדכון `src/components/AppHeader.tsx`

החלפת ה-header הנוכחי במבנה שנבחר (v3 — Sophisticated data hero), תוך שימוש בטוקנים הסמנטיים של הפרויקט (`bg-gradient-hero`, `primary-foreground`, `accent`, `primary-glow`) כדי לשמור על תאימות מצב כהה/בהיר.

### שינויי מבנה
1. **רקע מועשר**: שכבת רקע נקודות (radial-gradient grid 40px) מעל ה-gradient הקיים, בנוסף לשני ה-blobs המטושטשים (אחד נשמר, אחד מוגדל).
2. **שורת eyebrow חדשה**: צ׳יפ "Tel Aviv • Urban Renewal Intelligence" + מפריד קצר + תווית בטא ("גרסת בטא: רובעים 3-4, תל אביב*") — כל המטא-מידע בשורה אחת במקום פסקה.
3. **כותרת מודגשת**: H1 בשתי שורות, השורה השנייה ("בהתחדשות עירונית") עם gradient text מ-`accent` אל `primary-foreground`. גודל `text-4xl md:text-6xl`.
4. **תיאור תמציתי**: פסקה אחת קצרה במקום שלוש שורות, ברוחב מוגבל (`max-w-2xl`) לקריאות טובה.
5. **תגי סימוכין משודרגים**: שלושת ה-badges הופכים לכרטיסיות מעוגלות (`rounded-xl`) עם blur, dot צבעוני בקצה (כחול פועם, סגול, ירוק) ו-hover state.

### שינויי טקסט
- הסרת אייקון Building (לא בכיוון שנבחר).
- הסרת שלוש שורות התיאור הארוכות — איחוד למשפט אחד.
- העברת "גרסת בטא" משורת התיאור לשורת ה-eyebrow.

### עיצוב
- שימוש בטוקנים סמנטיים בלבד (אין צבעים hard-coded חוץ מ-`emerald-400` לנקודה השלישית — אפשר להחליף ב-token אם תרצה).
- שמירה על `dir="rtl"` הגלובלי של `index.html`.
- ללא שינוי ב-`AppHeader` props/exports — קומפוננטה ללא props גם בגרסה החדשה.

### קבצים שיתעדכנו
- `src/components/AppHeader.tsx` — rewrite מלא של ה-component (כולל הוספת sub-component פנימי `ReferenceBadge` למניעת חזרה).

ללא שינויים ב-`index.css`, `tailwind.config.ts`, או קבצים אחרים.
