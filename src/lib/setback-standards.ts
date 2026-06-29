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
  if (plotWidth && plotDepth && plotWidth > 0 && plotDepth > 0) {
    const w = Math.max(0, plotWidth - 2 * setbacks.side);
    const d = Math.max(0, plotDepth - setbacks.front - setbacks.rear);
    return Math.round(w * d);
  }
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
// מסלולים פעילים (לאחר פקיעת תמ"א 38 ב-10/2022):
//   local_renewal — תכנית מקומית/הקלות ועדה מקומית (חלופי לתמ"א 38/2 ההיסטורית). ~25% חלק דיירים.
//   demolition_rebuild   — פינוי-בינוי לפי חוק התשנ"ז-2006. ~40% חלק דיירים.
//   rova_plan     — תכנית רובעית (תא/3616/א, תא/3729/א). ~30% חלק דיירים.

export type RenewalTrack = "local_renewal" | "demolition_rebuild" | "rova_plan";

export interface RenewalSetbackStandard {
  front: number;
  side: number;
  rear: number;
  tenantShareOfUpliftPct: number;
  source: string;
}

export const RENEWAL_SETBACKS: Record<3 | 4, Record<RenewalTrack, RenewalSetbackStandard>> = {
  3: {
    local_renewal: { front: 4, side: 2.5, rear: 4, tenantShareOfUpliftPct: 25,
      source: "תכנית מקומית — הקלות ועדה מקומית (רובע 3)" },
    demolition_rebuild: { front: 3, side: 2, rear: 3, tenantShareOfUpliftPct: 40,
      source: "תכנית פינוי-בינוי נקודתית (רובע 3)" },
    rova_plan: { front: 4, side: 2.5, rear: 4, tenantShareOfUpliftPct: 30,
      source: "תקנון רובע 3 — מסלול התחדשות" },
  },
  4: {
    local_renewal: { front: 4, side: 3, rear: 5, tenantShareOfUpliftPct: 25,
      source: "תכנית מקומית — הקלות ועדה מקומית (רובע 4)" },
    demolition_rebuild: { front: 3, side: 2.5, rear: 4, tenantShareOfUpliftPct: 40,
      source: "תכנית פינוי-בינוי נקודתית (רובע 4)" },
    rova_plan: { front: 4, side: 3, rear: 5, tenantShareOfUpliftPct: 30,
      source: "תקנון רובע 4 — מסלול התחדשות" },
  },
};

export const RENEWAL_TRACK_LABEL: Record<RenewalTrack, string> = {
  local_renewal: 'תכנית מקומית / הקלות ועדה (חלופי תמ"א 38)',
  demolition_rebuild: "פינוי-בינוי",
  rova_plan: "תכנית רובעית",
};

/**
 * זיהוי מסלול ההתחדשות לפי סוג הפרויקט וקלט נוסף.
 * ברירת מחדל: rova_plan (תכנית רובעית — המסלול הסטטוטורי הפעיל בת"א רובעים 3/4).
 * תמ"א 38 פקעה ב-10/2022 ואינה ברירת מחדל יותר.
 */
export function inferRenewalTrack(opts: {
  projectType?: "urban_renewal" | "new_construction" | "combination";
  renewalSubtype?: "local_renewal" | "demolition_rebuild";
  existingFloors?: number;
  existingUnits?: number;
}): RenewalTrack | null {
  if (opts.projectType && opts.projectType !== "urban_renewal" && opts.projectType !== "combination") {
    return null;
  }
  if (opts.renewalSubtype === "demolition_rebuild") return "demolition_rebuild";
  if (opts.renewalSubtype === "local_renewal") return "local_renewal";
  // היוריסטיקה: בניינים גבוהים/צפופים → פינוי-בינוי
  if ((opts.existingFloors ?? 0) >= 5 || (opts.existingUnits ?? 0) >= 12) return "demolition_rebuild";
  return "rova_plan";
}
