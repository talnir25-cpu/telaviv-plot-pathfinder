// קווי בניין סטטוטוריים לפי תקנון רובע — תל אביב-יפו.
// מקורות:
//   רובע 3 — תכנית תא/3616/א, סע' 4.1.3(ג).
//   רובע 4 — תכנית תא/3729/א, טבלת קווי בניין למגורים.

export interface SetbackStandard {
  front: number;
  side: number;
  rear: number;
  plan: string;
  section: string;
}

export const DEFAULT_SETBACKS: Record<3 | 4, SetbackStandard> = {
  3: { front: 5, side: 3, rear: 5, plan: "תא/3616/א", section: "סע' 4.1.3" },
  4: { front: 5, side: 4, rear: 6, plan: "תא/3729/א", section: "טבלה 4" },
};

export function estimateTypicalFloorArea(
  plotAreaSqm: number,
  setbacks: { front: number; side: number; rear: number },
  plotWidth?: number,
  plotDepth?: number,
): number {
  // עדיפות לממדים פיזיים אם סופקו — רוב מגרשי ת"א מלבניים צרים-ארוכים
  if (plotWidth && plotDepth && plotWidth > 0 && plotDepth > 0) {
    const w = Math.max(0, plotWidth - 2 * setbacks.side);
    const d = Math.max(0, plotDepth - setbacks.front - setbacks.rear);
    return Math.round(w * d);
  }
  if (!plotAreaSqm || plotAreaSqm <= 0) return 0;
  // fallback: קירוב מגרש מרובע
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
// בקווי הבניין הסטטוטוריים, מה שמגדיל את התכסית.
// חלוקת התמורה לדיירים מהדלתא בתכסית:
//   tama38_2   — 25% (תוספת ~25 מ"ר/דירה)
//   pinui_binui — 40% (דירה חדשה גדולה משמעותית)
//   rova_plan  — 30% (תכנית רובעית — תלוי בנספח התמורות)

export type RenewalTrack = "tama38_2" | "pinui_binui" | "rova_plan";

export interface RenewalSetbackStandard {
  front: number;
  side: number;
  rear: number;
  tenantShareOfUpliftPct: number;
  source: string;
}

export const RENEWAL_SETBACKS: Record<3 | 4, Record<RenewalTrack, RenewalSetbackStandard>> = {
  3: {
    tama38_2: { front: 4, side: 2.5, rear: 4, tenantShareOfUpliftPct: 25,
      source: 'תמ"א 38/2 — הקלות ועדה מקומית (רובע 3)' },
    pinui_binui: { front: 3, side: 2, rear: 3, tenantShareOfUpliftPct: 40,
      source: "תכנית פינוי-בינוי נקודתית (רובע 3)" },
    rova_plan: { front: 4, side: 2.5, rear: 4, tenantShareOfUpliftPct: 30,
      source: "תקנון רובע 3 — מסלול התחדשות" },
  },
  4: {
    tama38_2: { front: 4, side: 3, rear: 5, tenantShareOfUpliftPct: 25,
      source: 'תמ"א 38/2 — הקלות ועדה מקומית (רובע 4)' },
    pinui_binui: { front: 3, side: 2.5, rear: 4, tenantShareOfUpliftPct: 40,
      source: "תכנית פינוי-בינוי נקודתית (רובע 4)" },
    rova_plan: { front: 4, side: 3, rear: 5, tenantShareOfUpliftPct: 30,
      source: "תקנון רובע 4 — מסלול התחדשות" },
  },
};

export const RENEWAL_TRACK_LABEL: Record<RenewalTrack, string> = {
  tama38_2: 'תמ"א 38/2 (הריסה ובנייה)',
  pinui_binui: "פינוי-בינוי",
  rova_plan: "תכנית רובעית",
};

/**
 * זיהוי מסלול ההתחדשות לפי סוג הפרויקט וקלט נוסף.
 * heuristic: pinui_binui אם הוצהר; אחרת tama38_2 לבניינים נמוכים, rova_plan ברירת מחדל.
 */
export function inferRenewalTrack(opts: {
  projectType?: "urban_renewal" | "new_construction" | "combination";
  renewalSubtype?: "tama38" | "pinui_binui";
  existingFloors?: number;
  existingUnits?: number;
}): RenewalTrack | null {
  if (opts.projectType && opts.projectType !== "urban_renewal" && opts.projectType !== "combination") {
    return null;
  }
  if (opts.renewalSubtype === "pinui_binui") return "pinui_binui";
  if (opts.renewalSubtype === "tama38") return "tama38_2";
  // היוריסטיקה: בניינים גבוהים/צפופים → פינוי-בינוי
  if ((opts.existingFloors ?? 0) >= 5 || (opts.existingUnits ?? 0) >= 12) return "pinui_binui";
  return "tama38_2";
}
