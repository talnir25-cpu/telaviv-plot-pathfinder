// קווי בניין סטטוטוריים לפי תקנון רובע — תל אביב-יפו.
// מקורות:
//   רובע 3 — תכנית תא/3616/א, סע' 4.1.3(ג): "תכסית הנובעת מקווי בניין תהווה
//            גודל הקומה המקסימלי המותר".
//   רובע 4 — תכנית תא/3729/א, טבלת קווי בניין למגורים.
//
// TODO: לאמת את הערכים הספציפיים מול ה-PDF הרשמי של כל תקנון.
// הקבועים מבודדים כאן כך שעדכון מספר אחד מתעדכן בכל האפליקציה.

export interface SetbackStandard {
  front: number;   // קו בניין קדמי (מ׳)
  side: number;    // קו בניין צדדי (מ׳)
  rear: number;    // קו בניין אחורי (מ׳)
  plan: string;    // מספר תכנית סטטוטורית
  section: string; // סעיף/טבלה בתקנון
}

export const DEFAULT_SETBACKS: Record<3 | 4, SetbackStandard> = {
  3: { front: 5, side: 3, rear: 5, plan: "תא/3616/א", section: "סע' 4.1.3" },
  4: { front: 5, side: 4, rear: 6, plan: "תא/3729/א", section: "טבלה 4" },
};

/**
 * חישוב שטח קומה טיפוסית בקירוב מגרש מלבני.
 * side ≈ √שטח_מגרש; שטח_קומה = (side − 2·צד) × (side − קדמי − אחורי)
 */
export function estimateTypicalFloorArea(
  plotAreaSqm: number,
  setbacks: { front: number; side: number; rear: number },
): number {
  if (!plotAreaSqm || plotAreaSqm <= 0) return 0;
  const side = Math.sqrt(plotAreaSqm);
  const width = Math.max(0, side - 2 * setbacks.side);
  const depth = Math.max(0, side - setbacks.front - setbacks.rear);
  return Math.round(width * depth);
}

export function coveragePct(floorAreaSqm: number, plotAreaSqm: number): number {
  if (!plotAreaSqm) return 0;
  return Math.round((floorAreaSqm / plotAreaSqm) * 100);
}

// ============================================================================
// קווי בניין מוקלים בהליך התחדשות עירונית
// ----------------------------------------------------------------------------
// בהליכי תמ"א 38/2, פינוי-בינוי או תכנית רובעית — הוועדה המקומית רשאית להקל
// בקווי הבניין הסטטוטוריים. הערכים כאן הם ברירות מחדל היוריסטיות; ה-AI יכול
// להחזיר override במסגרת הניתוח.
//
// חלוקת התמורה לדיירים מהדלתא בתכסית:
//   tama38_2  — ~25% (תוספת ~25 מ"ר/דירה קיימת)
//   pinui_binui — ~40% (דירה חדשה גדולה ב-12-25 מ"ר +