# תמיכה בפוליגונים מרובי-טבעות (multi-rings עם חורים)

## רקע

הקוד הנוכחי ב-`supabase/functions/fetch-plot-geometry/index.ts` משתמש רק ב-`rings[0]` של פוליגון החלקה ושל המבנים:

```ts
const parcelRing = parcelFeature.geometry.rings[0];
const ring = b?.geometry?.rings?.[0];
```

ב-ArcGIS REST, השדה `rings` הוא מערך טבעות:
- **טבעת חיצונית (outer)** — נקודות בכיוון השעון (CW), שטח חיובי בנוסחת Shoelace חתומה.
- **טבעת פנימית/חור (hole)** — נקודות נגד כיוון השעון (CCW), שטח שלילי.
- חלקה עם חצר פנימית, או מבנה בצורת U/O, מיוצגים כ-multi-rings.

תוצאה של הקוד הנוכחי:
1. **שטח footprint שגוי** — `polygonArea` רץ רק על `rings[0]` ומתעלם מטבעות נוספות (גם חורים וגם חלקים נפרדים של אותו מבנה).
2. **סינון point-in-polygon לא מדויק** — מבנה שמרכזו בתוך חור בחלקה (חצר פנימית) ייכלל בטעות; חלקה מורכבת עם כמה טבעות חיצוניות תפסול מבנים לגיטימיים.

## מטרה

לסנן מבנים נגד גיאומטריית חלקה נכונה (outer minus holes), ולחשב footprint של מבנים תוך כיבוד חורים.

## שינויים ב-`supabase/functions/fetch-plot-geometry/index.ts`

### 1. עזרי גיאומטריה חדשים

- `signedArea(ring)` — נוסחת Shoelace חתומה, ללא `Math.abs`. סימן מבדיל outer מ-hole.
- `isOuterRing(ring)` — לפי סימן `signedArea` (ArcGIS: CW = שטח חתום שלילי במערכת מתמטית סטנדרטית = outer; נאמת מול דוגמה אמיתית בלוג).
- `pointInPolygonWithHoles(pt, rings)` — מחזיר `true` רק אם הנקודה בתוך טבעת חיצונית אחת ומחוץ לכל החורים השייכים לה. גרסה פשוטה: בתוך מספר אי-זוגי של טבעות (rule odd-even על כל הטבעות יחד) — מספיק כשגיאומטריה תקנית.
- `polygonAreaWithHoles(rings)` — סוכם `|signedArea|` של outers ומחסיר `|signedArea|` של holes.

### 2. סינון מבנים — להחליף את הבלוק הקיים

במקום:
```ts
const parcelRing = parcelFeature.geometry.rings[0];
const matchedBuildings = buildings.filter((b) => {
  const ring = b?.geometry?.rings?.[0];
  if (!ring) return false;
  return pointInPolygon(polygonCentroid(ring), parcelRing);
});
```

החדש:
```ts
const parcelRings = parcelFeature.geometry.rings;
const matchedBuildings = buildings.filter((b) => {
  const rings = b?.geometry?.rings;
  if (!rings?.length) return false;
  // מרכז הטבעת החיצונית של המבנה (הגדולה ביותר)
  const outer = rings.reduce((a, b) =>
    Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a);
  return pointInPolygonWithHoles(polygonCentroid(outer), parcelRings);
});
```

### 3. חישוב footprint עם חורים

במקום:
```ts
for (const b of matchedBuildings) {
  const ring = b?.geometry?.rings?.[0];
  if (ring) buildingFootprint += polygonArea(ring);
}
```

החדש:
```ts
for (const b of matchedBuildings) {
  const rings = b?.geometry?.rings;
  if (rings?.length) buildingFootprint += polygonAreaWithHoles(rings);
}
```

### 4. Bounding box של החלקה

ה-`allPts = rings.flat()` הקיים כבר כולל את כל הטבעות — נשאר כמו שהוא ועובד נכון.

### 5. לוג

הוספת `parcelRingCount` ו-`bldgRingCounts` ל-`TLV_GIS_BUILDINGS` כדי לאמת בייצור שטבעות מרובות אכן מתקבלות.

## מה לא משתנה

- `polygonArea` (חיובי) נשאר עבור שימושים אחרים.
- `pointInPolygon` הישן (טבעת בודדת) נשאר כעזר ל-`pointInPolygonWithHoles`.
- אין שינוי בחוזה הנתונים המוחזר ללקוח.

## אימות

לאחר deploy — בדיקה על חלקה ידועה (לדוגמה הנוכחית עם 87+ נקודות) שלוגי `TLV_GIS_BUILDINGS` מציגים את אותו `matchedCount`, ו-`footprint` קרוב/שווה לקודם (יורד מעט אם יש חורים אמיתיים).
