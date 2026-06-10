## עדכון לוגיקת ספירת קומות ב-`parse-tabu-pdf`

### השינוי
ב-`supabase/functions/parse-tabu-pdf/index.ts`, להחליף את בלוק ה-deterministic recompute הקיים (שמשתמש ב-`EXCLUDE_FROM_COUNT` ובסינון מחרוזות) בלוגיקה מבוססת `floorNumberFromLabel` שכבר מוגדרת בקובץ.

### הקוד החדש (במקום שורות 200-209 הנוכחיות)

```ts
if (raw.floorsDetected && Array.isArray(raw.floorsDetected.labels)) {
  const floorNumbers = new Set<number>();
  for (const label of raw.floorsDetected.labels) {
    const n = floorNumberFromLabel(String(label));
    if (n !== null && n >= 1) floorNumbers.add(n); // >= 1 מחריג קרקע ומרתף
  }
  raw.floors = floorNumbers.size;
  const sorted = [...floorNumbers].sort((a, b) => a - b);
  raw.floorsExplain = `${floorNumbers.size} קומות (לא כולל קרקע/מרתף): ${sorted.join(', ')}`;
}
```

### למה זה עדיף על הגרסה הקודמת
- `floorNumberFromLabel` כבר מנרמל מירכאות/גרשיים/רווחים ומזהה גם "ראשונה"/"א"/"א׳" כ-1 — סינון לפי set מחרוזות פספס וריאציות.
- כל תווית שלא מתמפה למספר ≥ 1 (קרקע, מרתף, גג, תוויות לועזיות, רעש) פשוט לא נספרת — אין צורך ברשימת exclude.
- ה-set הוא על **מספרי קומות**, כך שכפילויות סמנטיות ("א" ו"ראשונה") נספרות פעם אחת.

### הערה
"גג" כרגע לא ממופה במספר ולכן לא נספר — תואם להגדרה (רק תוויות קומה אמיתיות 1+). אם בעתיד תרצי לכלול גג כקומה — נוסיף מיפוי ל-`floorNumberFromLabel`.

הפרומפט ל-Claude נשאר כפי שהוא — הוא רק צריך להחזיר את כל ה-labels הגולמיים, והשרת מחשב את הספירה הסמכותית.
