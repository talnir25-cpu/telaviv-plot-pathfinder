// Urban Renewal feasibility analyst — calls Lovable AI Gateway
// CORS handled manually (compatible with all SDK versions)

import { resolveExistingCoverage } from "../_shared/existing-coverage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PlotInput {
  quarter: 3 | 4;
  gush: number;
  helka: number;
  area: number | null;
  shapeArea: number | null;
  existingUnits: number;
  existingFloors: number;
  existingBuiltAreaSqm?: number;
  existingBuiltAreaSource?: string;
  existingBuiltAreaConfidence?: string;
  conservation: boolean;
  conservationDetails?: {
    level?: "מחמיר" | "רגיל" | null;
    buildingName?: string | null;
    planRef?: string | null;
    strictRestrictions?: boolean;
    inUnescoBuffer?: boolean;
    source?: string;
    confidence?: string;
    description?: string | null;
  };
  notes?: string;
  sellableRatioPct?: number;
  frontSetbackM?: number;
  sideSetbackM?: number;
  rearSetbackM?: number;
  plotWidthM?: number;
  plotDepthM?: number;
  buildingYear?: number;
  centroidX?: number;
  centroidY?: number;
  setbackSource?: "regulation" | "manual" | "manual_override";
  // אופציונלי — דריסה ידנית של ייעוד הקרקע ע"י המשתמש
  zoneLabelOverride?: string;
  // אופציונלי — דריסה ידנית של מסלול ההתחדשות ע"י המשתמש
  renewalTrackOverride?: "local_renewal" | "demolition_rebuild" | "rova_plan";
  areaHint?: "declaration" | "market_street" | "rest";
  street?: string;
  address?: string;
  tabuAnalysis?: {
    units: number;
    floors: number;
    avgUnitSize: number;
    plotArea: number;
    coverageRatio: number;
    buildingYear: number | null;
    warnings: Array<{ text: string; party: string; year: number }>;
    hasActiveRenewal: boolean;
    renewalParty: string | null;
  };
  // ── תכסית מדויקת מ-GIS עיריית תל אביב ──
  coverageExact?: number;
  buildingFootprint?: number;
  coverageReliable?: boolean;
  coverageStatus?: string;
}

interface ZoneInfo {
  plan_code: string;
  zone_label: string;
  rights: {
    coverage_pct: number | null;
    max_coverage_pct: number | null;
    max_far: number | null;
    max_floors_above: number | null;
    max_floors_roof: number | null;
    density_coefficient_sqm_per_unit: number | null;
    min_unit_size_sqm: number | null;
    setback_front_m: number | null;
    setback_side_m: number | null;
    setback_rear_m: number | null;
    tama38_far_bonus: number;
    demolition_rebuild_far_bonus: number;
    rova_plan_far_bonus: number;
    tama38_units_bonus_pct: number;
    demolition_rebuild_units_bonus_pct: number;
    rights_basis: "far_legacy" | "floors_density" | null;
    service_area_ratio_pct: number | null;
    requires_manual_classification: boolean;
    classification_note: string | null;
  };
  source_citation: string;
  notes: string | null;
  confidence: "high" | "medium" | "low";
  available_zones: string[];
}


// העתק דטרמיניסטי של src/lib/setback-standards.ts (Deno לא מייבא מ-src/)
function estimateTypicalFloorArea(
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

type RenewalTrack = "local_renewal" | "demolition_rebuild" | "rova_plan";
interface RenewalSetbackStandard {
  front: number; side: number; rear: number;
  tenantShareOfUpliftPct: number; source: string;
}
const RENEWAL_SETBACKS: Record<3 | 4, Record<RenewalTrack, RenewalSetbackStandard>> = {
  3: {
    local_renewal: { front: 4, side: 2.5, rear: 4, tenantShareOfUpliftPct: 25, source: "תכנית מקומית — הקלות ועדה מקומית (רובע 3)" },
    demolition_rebuild: { front: 3, side: 2, rear: 3, tenantShareOfUpliftPct: 40, source: "אומדן קווי בניין לתרחיש הריסה ובנייה מחדש (רובע 3)" },
    rova_plan: { front: 4, side: 2.5, rear: 4, tenantShareOfUpliftPct: 30, source: "תקנון רובע 3 — מסלול התחדשות" },
  },
  4: {
    local_renewal: { front: 4, side: 3, rear: 5, tenantShareOfUpliftPct: 25, source: "תכנית מקומית — הקלות ועדה מקומית (רובע 4)" },
    demolition_rebuild: { front: 3, side: 2.5, rear: 4, tenantShareOfUpliftPct: 40, source: "אומדן קווי בניין לתרחיש הריסה ובנייה מחדש (רובע 4)" },
    rova_plan: { front: 4, side: 3, rear: 5, tenantShareOfUpliftPct: 30, source: "תקנון רובע 4 — מסלול התחדשות" },
  },
};
const RENEWAL_TRACK_LABEL: Record<RenewalTrack, string> = {
  local_renewal: "תכנית מקומית / הקלות ועדה",
  demolition_rebuild: "הריסה ובנייה מחדש",
  rova_plan: "תכנית רובעית",
};

function inferRenewalTrack(existingFloors: number, existingUnits: number, conservation: boolean, buildingYear?: number): RenewalTrack {
  // ברירת מחדל: rova_plan — המסלול הסטטוטורי הפעיל בת"א רובעים 3/4 לאחר פקיעת תמ"א 38 (10/2022).
  if (conservation) return "rova_plan";
  if (existingFloors >= 5 || existingUnits >= 12) return "demolition_rebuild";
  if (buildingYear != null && buildingYear < 1980) return "local_renewal";
  return "rova_plan";
}


const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "render_feasibility_narrative",
    description: "Return narrative text for an already-finalized, deterministically-computed Tel Aviv urban-renewal feasibility report. This tool does NOT compute or estimate any numeric values — all numbers are provided as fixed input and must be used as-is.",
    parameters: {
      type: "object",
      properties: {
        statusLabel: { type: "string", description: "Hebrew label for the status badge — must match and describe the status value provided in the prompt, not invent a different one" },
        headline: { type: "string", description: "One sentence headline summary in Hebrew, based strictly on the figures provided" },
        committeeSummary: { type: "string", description: "3-5 sentence Investment Committee summary in Hebrew, based strictly on the figures and red flags provided" },
        additionalRedFlagNotes: {
          type: "array",
          items: { type: "string" },
          description: "Optional short Hebrew narrative notes elaborating on red flags already identified in the input (e.g. corner-lot complexity, market context) — textual elaboration only, must not introduce new numeric claims or contradict the provided figures.",
        },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "List of PDF documents cited, drawn from the source citations provided in the input",
        },
      },
      required: ["statusLabel", "headline", "committeeSummary", "additionalRedFlagNotes", "sources"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `אתה כותב תקצירים לוועדת השקעות בתחום ההתחדשות העירונית בתל אביב.

תפקידך היחיד: לנסח טקסט בעברית מקצועית ותמציתית על בסיס דוח מספרי שכבר חושב באופן דטרמיניסטי ונמסר לך כעובדה סגורה. אסור לך:
- לחשב, להעריך, או להציע מספר כלשהו (שטחים, יחידות, קומות, אחוזים, מרחקים, עלויות).
- לסתור או "לתקן" מספר שנמסר לך — גם אם הוא נראה לך לא סביר.
- להוסיף דגלים אדומים חדשים המבוססים על הערכה מספרית עצמאית (למשל מי תהום, עצים, חניה) — רק לנסח טקסט המבוסס על דגלים שכבר זוהו בקלט.

תפקידך: לכתוב כותרת תמציתית (headline), תווית סטטוס (statusLabel) שמתארת נאמנה את ה-status שנמסר, תקציר ועדת השקעות (committeeSummary) המבוסס אך ורק על הנתונים שבקלט, והערות ניסוח קצרות לדגלים קיימים אם רלוונטי.`;


// ── Service-role REST helpers for analysis_jobs ──
async function createJob(input: unknown, userId: string): Promise<string | null> {
  const supaUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supaUrl || !serviceKey) {
    console.error("createJob: missing env");
    return null;
  }
  try {
    const r = await fetch(`${supaUrl}/rest/v1/analysis_jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status: "processing", input, user_id: userId }),
    });
    if (!r.ok) {
      console.error("createJob failed", r.status, await r.text());
      return null;
    }
    const rows = await r.json();
    return Array.isArray(rows) && rows[0]?.id ? rows[0].id as string : null;
  } catch (e) {
    console.error("createJob threw", e);
    return null;
  }
}

// Resolve the authenticated user from the Authorization header by calling Auth.
async function getUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const supaUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supaUrl || !anonKey) return null;
  try {
    const r = await fetch(`${supaUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: auth },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return typeof u?.id === "string" ? u.id : null;
  } catch (e) {
    console.error("getUserId failed", e);
    return null;
  }
}

async function updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  const supaUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supaUrl || !serviceKey) return;
  try {
    const r = await fetch(`${supaUrl}/rest/v1/analysis_jobs?id=eq.${jobId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    });
    if (!r.ok) console.error("updateJob failed", r.status, await r.text());
  } catch (e) {
    console.error("updateJob threw", e);
  }
}

async function runAnalysis(body: PlotInput): Promise<unknown> {
  // ── Tabu override (priority over user-entered fields) ──
  if (body.tabuAnalysis) {
    const t = body.tabuAnalysis;
    if (t.units > 0) body.existingUnits = t.units;
    if (t.floors > 0) body.existingFloors = t.floors;
    if (t.buildingYear && t.buildingYear >= 1900) body.buildingYear = t.buildingYear;
    if (t.plotArea > 0) {
      body.area = t.plotArea;
      if (!body.shapeArea) body.shapeArea = t.plotArea;
    }
    if (t.avgUnitSize > 0 && t.units > 0 && !body.existingBuiltAreaSqm) {
      body.existingBuiltAreaSqm = Math.round(t.avgUnitSize * t.units);
      body.existingBuiltAreaSource = "tabu";
      body.existingBuiltAreaConfidence = "high";
    }
  }

  if (!body.existingUnits || body.existingUnits < 1) {
    throw new Error("לא ניתן לחשב מכפיל ללא נתון על יח\"ד קיימות (existingUnits ≥ 1)");
  }



    // ── שליפת זכויות הבנייה מהתקנון (lookup-zone-info) ──
    let zoneInfo: ZoneInfo | null = null;
    try {
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
      if (supaUrl && anonKey) {
        const zResp = await fetch(`${supaUrl}/functions/v1/lookup-zone-info`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${anonKey}`, apikey: anonKey },
          body: JSON.stringify({
            quarter: body.quarter,
            gush: body.gush,
            helka: body.helka,
            street: body.street,
            zone_label_override: body.zoneLabelOverride,
            area_hint: body.areaHint,
            centroidX: body.centroidX,
            centroidY: body.centroidY,
            plot_area: body.area ?? body.shapeArea ?? null,
          }),
        });
        if (zResp.ok) zoneInfo = await zResp.json();
        else console.warn("lookup-zone-info non-OK", zResp.status, await zResp.text());
      }
    } catch (e) {
      console.warn("lookup-zone-info failed (non-fatal)", e);
    }

    const plotAreaForCalc = body.area ?? body.shapeArea ?? 0;
    // קווי בניין: עדיפות לתקנון (zoneInfo.rights), אחר כך קלט ידני, אחר כך אין.
    const regSetbacks = zoneInfo?.rights
      ? { front: zoneInfo.rights.setback_front_m, side: zoneInfo.rights.setback_side_m, rear: zoneInfo.rights.setback_rear_m }
      : null;
    const hasRegSetbacks =
      regSetbacks != null && regSetbacks.front != null && regSetbacks.side != null && regSetbacks.rear != null;
    const hasManualSetbacks =
      body.frontSetbackM != null && body.sideSetbackM != null && body.rearSetbackM != null;
    const effectiveSetbacks = hasRegSetbacks
      ? { front: regSetbacks!.front as number, side: regSetbacks!.side as number, rear: regSetbacks!.rear as number }
      : hasManualSetbacks
        ? { front: body.frontSetbackM!, side: body.sideSetbackM!, rear: body.rearSetbackM! }
        : null;
    const setbacksSource: "regulation" | "manual" | "none" =
      hasRegSetbacks ? "regulation" : hasManualSetbacks ? "manual" : "none";
    const typicalFloorArea = effectiveSetbacks && plotAreaForCalc > 0
      ? estimateTypicalFloorArea(plotAreaForCalc, effectiveSetbacks, body.plotWidthM, body.plotDepthM)
      : 0;
    // ── תכסית מוצעת — מקור עיקרי: טבלת zoning_rights בדאטא־בייס לפי רובע/אזור ──
    // עדיפויות: max_coverage_pct (DB) → coverage_pct (DB) → חישוב מקווי בניין (setbacks)
    const dbMaxCoveragePct = zoneInfo?.rights?.max_coverage_pct ?? zoneInfo?.rights?.coverage_pct ?? null;
    const coveragePctFromSetbacks = typicalFloorArea && plotAreaForCalc
      ? Math.round((typicalFloorArea / plotAreaForCalc) * 100)
      : 0;
    const coveragePctVal = (dbMaxCoveragePct != null && dbMaxCoveragePct > 0)
      ? dbMaxCoveragePct
      : coveragePctFromSetbacks;
    const coveragePctBasis: "db_zoning_rights" | "setbacks" | "none" =
      (dbMaxCoveragePct != null && dbMaxCoveragePct > 0) ? "db_zoning_rights"
      : (coveragePctFromSetbacks > 0 ? "setbacks" : "none");
    const coveragePctSourceText = coveragePctBasis === "db_zoning_rights"
      ? `טבלת zoning_rights — ${zoneInfo?.zone_label ?? "אזור תקנוני"} (רובע ${body.quarter}). ${zoneInfo?.source_citation ?? ""}`.trim()
      : coveragePctBasis === "setbacks"
        ? "תקרת תכסית הנגזרת מקווי הבניין של התקנון (front/side/rear setbacks)."
        : "";

    // ── חישוב פוטנציאל הגדלת תכסית בהליך התחדשות (דטרמיניסטי) ──
    const inferredRenewalTrack = inferRenewalTrack(body.existingFloors ?? 0, body.existingUnits ?? 0, body.conservation, body.buildingYear);
    const renewalTrack: RenewalTrack = body.renewalTrackOverride ?? inferredRenewalTrack;
    const renewalTrackOverridden = !!body.renewalTrackOverride && body.renewalTrackOverride !== inferredRenewalTrack;
    const renewalCfg = plotAreaForCalc > 0 ? RENEWAL_SETBACKS[body.quarter]?.[renewalTrack] : null;
    const renewalFloorArea = renewalCfg
      ? estimateTypicalFloorArea(plotAreaForCalc, renewalCfg, body.plotWidthM, body.plotDepthM)
      : 0;
    // תכסית במסלול התחדשות — אם יש ערך DB, הוא התקרה הרגולטורית; אחרת חישוב מקווי בניין של המסלול
    const renewalCoveragePctFromSetbacks = renewalFloorArea && plotAreaForCalc
      ? Math.round((renewalFloorArea / plotAreaForCalc) * 100)
      : 0;
    const renewalCoveragePct = (dbMaxCoveragePct != null && dbMaxCoveragePct > 0)
      ? dbMaxCoveragePct
      : renewalCoveragePctFromSetbacks;
    const renewalCoverageBasis: "db_zoning_rights" | "setbacks" | "none" =
      (dbMaxCoveragePct != null && dbMaxCoveragePct > 0) ? "db_zoning_rights"
      : (renewalCoveragePctFromSetbacks > 0 ? "setbacks" : "none");
    const baselineFloorAreaForUplift = typicalFloorArea > 0
      ? typicalFloorArea
      : (plotAreaForCalc > 0 ? estimateTypicalFloorArea(plotAreaForCalc, { front: 5, side: 3, rear: 5 }, body.plotWidthM, body.plotDepthM) : 0);
    const upliftSqmPerFloor = Math.max(0, renewalFloorArea - baselineFloorAreaForUplift);
    const upliftPct = baselineFloorAreaForUplift > 0
      ? Math.round((upliftSqmPerFloor / baselineFloorAreaForUplift) * 100)
      : 0;

    // ── Deterministic report shell — AI will only add narrative text later ──
    const deterministicExisting = {
      units: body.existingUnits,
      floors: body.existingFloors,
      builtAreaSqm: body.existingBuiltAreaSqm && body.existingBuiltAreaSqm > 0
        ? body.existingBuiltAreaSqm
        : Math.round(body.existingUnits * 85),
      far: 0,
    };
    if (plotAreaForCalc > 0 && deterministicExisting.builtAreaSqm > 0) {
      deterministicExisting.far = Number(
        (deterministicExisting.builtAreaSqm / plotAreaForCalc).toFixed(2),
      );
    }

    // Seed zoning from zoneInfo (deterministic, from regulation). Physical fields
    // (trees, parking, groundwater) are left null — TODO: external data source.
    const zoningSeed: any = {
      maxHeightMeters: null,
      maxFloors: zoneInfo?.rights
        ? ((zoneInfo.rights.max_floors_above ?? 0) + (zoneInfo.rights.max_floors_roof ?? 0)) || null
        : null,
      frontSetbackM: body.frontSetbackM ?? zoneInfo?.rights?.setback_front_m ?? null,
      sideSetbackM: body.sideSetbackM ?? zoneInfo?.rights?.setback_side_m ?? null,
      rearSetbackM: body.rearSetbackM ?? zoneInfo?.rights?.setback_rear_m ?? null,
      maxFAR: null,
      source: zoneInfo?.source_citation ?? null,
      treesOnPlot: null,
      treesForConservation: null,
      parkingStandardPerUnit: null,
      requiredBasementFloors: null,
      todReliefApplies: null,
      groundwaterDepthM: null,
      dewateringRequired: null,
      _physicalFieldsNote: "שדות פיזיים (עצים, מי תהום, חניה) טרם ממומשים — דורשים מקור נתונים חיצוני (GIS עירוני / בדיקה ידנית). TODO נפרד.",
    };

    // deno-lint-ignore no-explicit-any
    const report: any = {
      status: "medium_potential",
      existing: deterministicExisting,
      proposed: null,
      metrics: null,
      zoning: zoningSeed,
      redFlags: [],
      sources: zoneInfo?.source_citation ? [zoneInfo.source_citation] : [],
    };



    // ── Post-validation: deterministic compute first, then sanity checks ──
    try {
      // ── Manual renewal track override (informational) ──
      if (renewalTrackOverridden) {
        report.redFlags.push({
          level: "info",
          title: "מסלול התחדשות נקבע ידנית",
          description: `המסלול "${RENEWAL_TRACK_LABEL[renewalTrack]}" נבחר ידנית על ידי המשתמש, ולא נגזר מההיוריסטיקה האוטומטית (מספר קומות/יח"ד קיימות, שנת בנייה). (ההיוריסטיקה האוטומטית הייתה מציעה: ${RENEWAL_TRACK_LABEL[inferredRenewalTrack]}.)`,
          source: "קביעה ידנית של המשתמש",
        });
      }

      // ── Tabu-derived active renewal notice (informational; does NOT block analysis) ──
      if (body.tabuAnalysis?.hasActiveRenewal) {
        const party = body.tabuAnalysis.renewalParty?.trim() || "יזם לא מזוהה";
        report.redFlags.unshift({
          level: "info",
          title: "בניין בהליך התחדשות פעיל",
          description: `זוהתה הערת אזהרה בטאבו לטובת ${party} — ייתכן שמתבצע תהליך התחדשות בפועל. הניתוח ממשיך כרגיל; מומלץ לאמת את סטטוס ההליך מול היזם/הוועדה לפני קבלת החלטות.`,
          source: "נסח טאבו",
        });
        // לא משנים את report.status — אין חסימה אוטומטית בגין הערת אזהרה.
      }

      // ── Tabu-derived cautionary notes (informational) ──
      if (body.tabuAnalysis?.warnings && body.tabuAnalysis.warnings.length > 0) {
        for (const w of body.tabuAnalysis.warnings.slice(0, 10)) {
          if (body.tabuAnalysis.hasActiveRenewal && /התחדשות|תמ.?א|פינוי/.test(w.text)) continue;
          report.redFlags.push({
            level: "info",
            title: `הערת אזהרה (${w.year})`,
            description: `${w.text} — לטובת ${w.party}`,
            source: "נסח טאבו",
          });
        }
      }

      // ── חישוב דטרמיניסטי של היקף הבנייה המוצעת (מקור יחיד: zoneInfo) ──
      try {
        const plotAreaDet = body.area ?? body.shapeArea ?? 0;
        const SELLABLE_RATIO = ((body.sellableRatioPct ?? 78) / 100);
        const FLOOR_HEIGHT_M = 3.2;


        let calcSource: any = null;

        if (zoneInfo && plotAreaDet > 0) {
          const r = zoneInfo.rights;

          const blockedByManualClassification =
            r.requires_manual_classification &&
            (renewalTrack === "demolition_rebuild" || renewalTrack === "rova_plan");

          if (blockedByManualClassification) {
            report.redFlags.push({
              level: "warning",
              title: "דורש סיווג ידני — לא ניתן לחשב זכויות אוטומטית",
              description: `המגרש משויך לאזור "${zoneInfo.zone_label}" בתקנון, שדורש זיהוי נוסף שאינו ממומש אוטומטית כיום${r.classification_note ? `: ${r.classification_note}` : "."} לא ניתן לחשב היקף בנייה מוצע ללא אימות תכנוני נקודתי.`,
              source: r.classification_note ?? zoneInfo.source_citation ?? "בדיקת שלמות אוטומטית — zoning_rights",
            });
            report.status = "blocked";
          }

          const useFloorsDensity =
            !blockedByManualClassification &&
            r.rights_basis === "floors_density" &&
            renewalTrack !== "local_renewal";


          if (useFloorsDensity) {
            const maxFloorsDet = (r.max_floors_above ?? 0) + (r.max_floors_roof ?? 0);
            // במודל floors_density שטח הקומה תמיד מהתקנון (typicalFloorArea עם effectiveSetbacks).
            // RENEWAL_SETBACKS הגנרי לא רלוונטי כאן.
            const floorAreaEff = typicalFloorArea;
            if (setbacksSource === "none") {
              report.redFlags.push({
                level: "warning",
                title: "קווי בניין לא זמינים — שטח קומה לא חושב",
                description: "לא נמצאו קווי בניין מהתקנון או מהזנת המשתמש. לא ניתן לחשב שטח קומה מוצע.",
                source: "בדיקת שלמות אוטומטית",
              });
            }
            const proposedBuilt = Math.round(floorAreaEff * maxFloorsDet);
            const limitingFactor = "floors_x_density";

            const proposedFloorsDet = Math.max(maxFloorsDet, 1);
            const heightDet = Math.round(proposedFloorsDet * FLOOR_HEIGHT_M * 10) / 10;

            const densityCoef = r.density_coefficient_sqm_per_unit ?? 0;
            if (densityCoef <= 0) {
              report.redFlags.push({
                level: "critical",
                title: "מקדם צפיפות חסר — לא ניתן לחשב יח״ד",
                description: `לאזור "${zoneInfo.zone_label}" אין מקדם צפיפות קבוע בתקנון. נדרש חישוב ידני.`,
                source: zoneInfo.source_citation,
              });
              report.status = "blocked";
            }
            const unitsByDensity = densityCoef > 0 ? Math.floor(proposedBuilt / densityCoef) : 0;
            const minUnitSize = r.min_unit_size_sqm;
            const unitsCappedByMinSize = minUnitSize && densityCoef > 0 && minUnitSize > densityCoef
              ? Math.floor(proposedBuilt / minUnitSize)
              : unitsByDensity;
            const unitsBeforeExistingFloor = Math.min(unitsByDensity, unitsCappedByMinSize);
            const proposedUnitsDet = Math.max(body.existingUnits ?? 0, unitsBeforeExistingFloor);

            if (densityCoef > 0 && unitsCappedByMinSize < unitsByDensity) {
              report.redFlags.push({
                level: "warning",
                title: "מספר יח\"ד הוגבל לפי מינימום שטח דירה חוקי",
                description: `מקדם הצפיפות בתקנון (${densityCoef} מ"ר/יח"ד) קטן מהמינימום החוקי לדירה (${minUnitSize} מ"ר). ספירת היח"ד הוגבלה מ-${unitsByDensity} ל-${unitsCappedByMinSize}.`,
                source: "בדיקת שלמות אוטומטית — zoning_rights",
              });
            }

            const sellableArea = proposedBuilt * SELLABLE_RATIO;
            const UNIT_MIX_DEFAULT = { min: 95, base: 78, max: 60 };
            const unitRange = {
              min: Math.floor(sellableArea / UNIT_MIX_DEFAULT.min),
              base: Math.round(sellableArea / UNIT_MIX_DEFAULT.base),
              max: Math.floor(sellableArea / UNIT_MIX_DEFAULT.max),
              avgUnitSizeMin: UNIT_MIX_DEFAULT.min,
              avgUnitSizeBase: UNIT_MIX_DEFAULT.base,
              avgUnitSizeMax: UNIT_MIX_DEFAULT.max,
            };
            const farDet = Number((proposedBuilt / plotAreaDet).toFixed(2));

            report.proposed = {
              units: proposedUnitsDet,
              floors: proposedFloorsDet,
              builtAreaSqm: proposedBuilt,
              far: farDet,
              heightMeters: heightDet,
              unitRange,
              sellableAreaSqm: Math.round(sellableArea),
            };

            const existingUnitsForMetrics = report.existing?.units ?? body.existingUnits ?? 0;
            report.metrics = {
              multiplier: existingUnitsForMetrics > 0
                ? Number((proposedUnitsDet / existingUnitsForMetrics).toFixed(2))
                : 0,
              newUnits: Math.max(0, proposedUnitsDet - existingUnitsForMetrics),
              estimatedSellableArea: Math.round(sellableArea),
              avgUnitSize: proposedUnitsDet > 0
                ? Math.round(proposedBuilt / proposedUnitsDet)
                : (r.min_unit_size_sqm ?? 90),
            };

            calcSource = {
              method: "regulation",
              plan_code: zoneInfo.plan_code,
              zone_label: zoneInfo.zone_label,
              source_citation: zoneInfo.source_citation,
              confidence: zoneInfo.confidence,
              available_zones: zoneInfo.available_zones,
              rights_basis: r.rights_basis,
              base_far_pct: null,
              far_bonus_pct: 0,
              effective_far_pct: null,
              density_coefficient_sqm_per_unit: densityCoef,
              units_bonus_pct: 0,
              floors_used: maxFloorsDet,
              max_floors: maxFloorsDet,
              renewal_track: renewalTrack,
              renewal_track_label: RENEWAL_TRACK_LABEL[renewalTrack],
              coverage_pct_used: r.max_coverage_pct ?? null,
              built_area_limiting_factor: limitingFactor,
              service_area_ratio_pct: r.service_area_ratio_pct ?? null,
            };
          } else if (!blockedByManualClassification) {
            report.redFlags.push({
              level: "critical",
              title: "חישוב לא זמין במסלול זה — נדרש מודל זכויות נפרד",
              description: `לאזור "${zoneInfo.zone_label}" אין מודל חישוב תקף במסלול ${RENEWAL_TRACK_LABEL[renewalTrack]}. שורה זו מבוססת על מודל קומות×צפיפות תקנוני שעדיין לא הוגדר לתוספת לבניין קיים (local_renewal) — TODO פתוח. לא ניתן להציג היקף בנייה/יח"ד מוצעים ללא חישוב דטרמיניסטי תקף.`,
              source: "בדיקת שלמות אוטומטית — analyze-plot (local_renewal TODO)",
            });
            report.status = "blocked";
            report.proposed = null;
            report.metrics = null;
          }

        } else {
          // ───────── No zoneInfo → cannot compute deterministically; AI must NOT estimate ─────────
          report.redFlags.push({
            level: "critical",
            title: "לא נמצאו זכויות בנייה בתקנון",
            description: `לא ניתן לאתר את האזור התקנוני (גוש ${body.gush} חלקה ${body.helka} ברובע ${body.quarter}) בטבלת zoning_rights. ללא מקור תקנוני דטרמיניסטי, האפליקציה לא תציע מספרים — נדרש סיווג ידני.`,
            source: "בדיקת שלמות אוטומטית — lookup-zone-info",
          });
          report.status = "blocked";
          report.proposed = null;
          report.metrics = null;
        }

        if (calcSource) {
          report.calculationSource = calcSource;
        }
      } catch (e) {
        console.error("deterministic proposed-compute error (non-fatal)", e);
      }

      // ── Sanity validations against the deterministic proposed numbers ──
      const existingU = report.existing?.units ?? body.existingUnits;
      const proposedU = report.proposed?.units ?? 0;
      const multiplier = existingU > 0 ? proposedU / existingU : 0;

      if (multiplier > 4.5) {
        report.redFlags.push({
          level: "warning",
          title: "מכפיל יח\"ד חריג",
          description: `מכפיל ${multiplier.toFixed(2)}× חורג מהמקובל (2.5-4×). דורש אישור ועדה מיוחדת והצדקה תכנונית.`,
          source: "בדיקת עקביות אוטומטית",
        });
      }

      const maxFloors = report.zoning?.maxFloors;
      const proposedFloors = report.proposed?.floors;
      if (maxFloors && proposedFloors && proposedFloors > maxFloors) {
        report.redFlags.push({
          level: "critical",
          title: "חריגה ממגבלת קומות",
          description: `${proposedFloors} קומות מוצעות חורגות מתקנון הרובע (מקסימום ${maxFloors}).`,
          source: "בדיקת עקביות אוטומטית",
        });
        if (report.status !== "blocked") report.status = "high_risk";
      }

      const plotArea = body.area ?? body.shapeArea ?? 0;
      if (plotArea > 0 && plotArea < 500 && existingU < 6) {
        report.redFlags.push({
          level: "warning",
          title: "מגרש קטן — סף כלכלי",
          description: `מגרש ${plotArea} מ"ר עם ${existingU} יח"ד קיימות — קושי לעבור סף כלכלי לפינוי-בינוי.`,
          source: "בדיקת עקביות אוטומטית",
        });
      }

      // ── תכסית מוצעת — נשען על DB (zoning_rights) ואם אין, על setbacks ──
      const hasSetbacks = effectiveSetbacks != null;
      if (coveragePctVal > 0) {
        report.zoning.coveragePct = coveragePctVal;
        report.zoning.coveragePctBasis = coveragePctBasis;
        report.zoning.coveragePctSource = coveragePctSourceText;
      }
      if (hasSetbacks && typicalFloorArea > 0) {
        report.zoning.frontSetbackM = effectiveSetbacks!.front;
        report.zoning.sideSetbackM = effectiveSetbacks!.side;
        report.zoning.rearSetbackM = effectiveSetbacks!.rear;
        report.zoning.typicalFloorAreaSqm = typicalFloorArea;
        report.zoning.setbackSource = setbacksSource === "none" ? (body.setbackSource ?? "regulation") : (setbacksSource as "regulation" | "manual");
      }

      // ── תכסית קיימת — לא תלוי בקווי בניין/מעטפת מוצעת ──
      // עדיפות 1: GIS אמין מהשלב המקדים, עדיפות 2: חישוב פנימי
      const coverageResolution = resolveExistingCoverage({
        coverageReliable: body.coverageReliable,
        coverageExact: body.coverageExact,
        buildingFootprint: body.buildingFootprint,
        coverageStatus: body.coverageStatus,
        plotArea,
        existingBuiltAreaSqm: report.existing?.builtAreaSqm,
        existingFloors: report.existing?.floors,
      });
      if (coverageResolution) {
        report.zoning.coverageExistingPct = coverageResolution.coverageExistingPct;
        if (coverageResolution.buildingFootprintSqm != null) {
          report.zoning.buildingFootprintSqm = coverageResolution.buildingFootprintSqm;
        }
        report.zoning.coverageSource = coverageResolution.coverageSource;
        if (!report.sources.includes(coverageResolution.sourceLine)) {
          report.sources.push(coverageResolution.sourceLine);
        }

        if (
          coverageResolution.source === "gis" &&
          coveragePctVal > 0 &&
          coverageResolution.coverageExistingPct > coveragePctVal + 5
        ) {
          report.redFlags.push({
            level: "warning",
            title: "חריגה היסטורית מהמעטפת הסטטוטורית",
            description: `תכסית קיימת ${coverageResolution.coverageExistingPct}% גבוהה מהתכסית התכנונית ${coveragePctVal}% (קווי בניין). ייתכן שהמבנה הקיים נבנה בהיתר חורג או לפני התקנון הנוכחי — נדרשת בדיקה משפטית/תכנונית לפני שימוש בזכויות.`,
            source: "השוואת GIS מול תקנון",
          });
        }
      }
      {



        const proposedBuilt = report.proposed?.builtAreaSqm ?? 0;
        const proposedFloorsVal = report.proposed?.floors ?? 0;
        const maxFloorsVal = report.zoning?.maxFloors ?? 0;
        if (proposedBuilt > 0 && typicalFloorArea > 0) {
          const floorsNeeded = Math.ceil(proposedBuilt / typicalFloorArea);
          report.zoning.floorsNeededForFAR = floorsNeeded;
          const srcLabel = body.setbackSource === "regulation" ? "תקנון רובע" : "הזנת משתמש";
          const srcTag = `בדיקת תכסית — קווי בניין (${srcLabel})`;

          if (floorsNeeded > proposedFloorsVal && floorsNeeded <= maxFloorsVal) {
            report.redFlags.push({
              level: "warning",
              title: "תכנון לא ריאלי גיאומטרית",
              description: `שטח הבנייה המוצע (${proposedBuilt} מ"ר) דורש ${floorsNeeded} קומות בהינתן שטח קומה טיפוסי של ${typicalFloorArea} מ"ר, אך הוצעו רק ${proposedFloorsVal}. שקול להגדיל את מספר הקומות.`,
              source: srcTag,
            });
          } else if (floorsNeeded > maxFloorsVal && maxFloorsVal > 0) {
            report.redFlags.push({
              level: "critical",
              title: "התכסית חוסמת את ה-FAR",
              description: `נדרשות ${floorsNeeded} קומות לתמיכה בשטח המוצע (${proposedBuilt} מ"ר), אך מקסימום הקומות לפי תקנון הוא ${maxFloorsVal}.`,
              source: srcTag,
            });
            report.status = "blocked";
          } else if (proposedFloorsVal > floorsNeeded * 1.5 && floorsNeeded > 0) {
            report.redFlags.push({
              level: "info",
              title: "ניצול חסר של תכסית",
              description: `${proposedFloorsVal} קומות מוצעות עבור שטח שניתן להכיל ב-${floorsNeeded} קומות בלבד.`,
              source: srcTag,
            });
          }
        }
      }

      // ── אכלוס פוטנציאל הגדלת תכסית בהליך התחדשות ──
      if (renewalFloorArea > 0 && renewalCfg && upliftSqmPerFloor > 0) {
        const proposedFloorsForUplift = report.proposed?.floors ?? 0;
        let realization = 1.0;
        if (body.conservation) realization -= 0.10;
        realization = Math.max(0.5, Math.min(1.0, realization));

        const effectiveUpliftSqmTotal = Math.round(
          upliftSqmPerFloor * proposedFloorsForUplift * realization,
        );

        report.zoning.renewalPotential = {
          track: renewalTrack,
          trackLabel: RENEWAL_TRACK_LABEL[renewalTrack],
          frontSetbackM: renewalCfg.front,
          sideSetbackM: renewalCfg.side,
          rearSetbackM: renewalCfg.rear,
          typicalFloorAreaSqm: renewalFloorArea,
          coveragePct: renewalCoveragePct,
          coveragePctBasis: renewalCoverageBasis,
          coveragePctSource: renewalCoverageBasis === "db_zoning_rights"
            ? `טבלת zoning_rights — ${zoneInfo?.zone_label ?? "אזור תקנוני"} (רובע ${body.quarter}). ${zoneInfo?.source_citation ?? ""}`.trim()
            : renewalCfg.source,
          upliftSqmPerFloor,
          upliftPct,
          realizationFactor: Number(realization.toFixed(2)),
          effectiveUpliftSqmTotal,
          tenantShareOfUpliftPct: renewalCfg.tenantShareOfUpliftPct,
          source: renewalCfg.source,
        };

        const existingBuiltForFlag = report.existing?.builtAreaSqm ?? 0;
        if (existingBuiltForFlag > 0 && effectiveUpliftSqmTotal > existingBuiltForFlag * 0.3) {
          report.redFlags.push({
            level: "info",
            title: "פוטנציאל הגדלת תכסית בהליך התחדשות",
            description: `מסלול ${RENEWAL_TRACK_LABEL[renewalTrack]}: תכסית פוטנציאלית ~${renewalCoveragePct}% (לעומת בסיס ~${coveragePctVal || "?"}%), תוספת אפקטיבית של ${effectiveUpliftSqmTotal.toLocaleString("he-IL")} מ"ר כולל.`,
            source: renewalCfg.source,
          });
        }
      }

      // ── Final status upgrade: if not blocked/high_risk and multiplier strong, mark high_potential ──
      if (report.status === "medium_potential" && report.proposed?.units != null && existingU > 0) {
        const finalMultiplier = report.proposed.units / existingU;
        if (finalMultiplier >= 2.0) report.status = "high_potential";
      }

    } catch (e) {
      console.error("post-validation error (non-fatal)", e);
    }

    // ── AI narrative pass: text only, numbers are read-only input ──
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY missing");
    }

    const userPrompt = `הדוח המספרי הבא כבר חושב באופן דטרמיניסטי וסגור — אינו ניתן לשינוי. כתוב עבורו headline, statusLabel, committeeSummary, ו-additionalRedFlagNotes בלבד, בעברית.

סטטוס: ${report.status}

מצב קיים:
  יח"ד: ${deterministicExisting.units}
  קומות: ${deterministicExisting.floors}
  שטח בנוי: ${deterministicExisting.builtAreaSqm} מ"ר

מצב מוצע: ${report.proposed ? `
  יח"ד: ${report.proposed.units}
  קומות: ${report.proposed.floors}
  שטח בנוי: ${report.proposed.builtAreaSqm} מ"ר
  גובה: ${report.proposed.heightMeters} מ'` : "לא חושב — המגרש חסום (ראה דגלים אדומים)"}

מדדים: ${report.metrics ? `מכפיל ${report.metrics.multiplier}, יח"ד נוספות ${report.metrics.newUnits}, שטח מכירה משוער ${report.metrics.estimatedSellableArea} מ"ר` : "לא זמינים"}

זכויות בנייה: ${zoneInfo ? `${zoneInfo.zone_label} (מקור: ${zoneInfo.source_citation ?? "—"})` : "לא זוהה אזור תקנוני"}
מסלול התחדשות: ${RENEWAL_TRACK_LABEL[renewalTrack]}${renewalTrackOverridden ? " (נקבע ידנית ע\"י המשתמש)" : ""}

דגלים אדומים שכבר זוהו (${(report.redFlags ?? []).length}):
${(report.redFlags ?? []).map((f: any) => `  [${f.level}] ${f.title}: ${f.description}`).join("\n") || "  (אין)"}

הערות נוספות מהמשתמש: ${body.notes ?? "—"}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: ANALYSIS_TOOL.function.name,
            description: ANALYSIS_TOOL.function.description,
            parameters: ANALYSIS_TOOL.function.parameters,
          },
        }],
        tool_choice: { type: "function", function: { name: "render_feasibility_narrative" } },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      if (aiResp.status === 429) throw new Error("חרגת ממכסת בקשות בדקה — נסה שוב בעוד רגע");
      if (aiResp.status === 402) throw new Error("נגמרו הקרדיטים ב-Lovable AI — יש לטעון מחדש בהגדרות החיוב");
      throw new Error(`AI gateway error ${aiResp.status}: ${t.slice(0, 300)}`);
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    const rawArgs = toolCall?.function?.arguments;
    let parsedArgs: any = null;
    if (typeof rawArgs === "string") {
      try { parsedArgs = JSON.parse(rawArgs); } catch { parsedArgs = null; }
    } else if (rawArgs && typeof rawArgs === "object") {
      parsedArgs = rawArgs;
    }
    if (!parsedArgs) {
      console.error("No tool_call in narrative response", JSON.stringify(aiJson).slice(0, 500));
      // Fallback narrative — keep deterministic numbers, fill text with safe defaults
      parsedArgs = {
        statusLabel: report.status,
        headline: "דוח היתכנות — לא נוצר תיאור אוטומטי",
        committeeSummary: "המספרים בדוח חושבו דטרמיניסטית. שירות הניסוח האוטומטי לא החזיר תקציר; ראה דגלים אדומים ונתונים מספריים.",
        additionalRedFlagNotes: [],
        sources: [],
      };
    }

    // ── Merge: numbers from deterministic report, text from AI ──
    report.statusLabel = parsedArgs.statusLabel;
    report.headline = parsedArgs.headline;
    report.committeeSummary = parsedArgs.committeeSummary;
    report.additionalRedFlagNotes = Array.isArray(parsedArgs.additionalRedFlagNotes)
      ? parsedArgs.additionalRedFlagNotes
      : [];
    if (Array.isArray(parsedArgs.sources)) {
      for (const s of parsedArgs.sources) {
        if (typeof s === "string" && !report.sources.includes(s)) report.sources.push(s);
      }
    }

  return report;
}

// ── Edge handler: create job, run analysis in background, return 202 immediately ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as PlotInput;

    if (!body || !body.quarter || !body.gush || !body.helka) {
      return new Response(JSON.stringify({ error: "missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobId = await createJob(body, userId);
    if (!jobId) {
      return new Response(JSON.stringify({ error: "Failed to create analysis job" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Run the heavy analysis in the background. The HTTP response returns immediately.
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    const work = (async () => {
      try {
        const report = await runAnalysis(body);
        await updateJob(jobId, { status: "completed", result: { report } });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.error(`job ${jobId} failed:`, msg);
        await updateJob(jobId, { status: "failed", error_message: msg });
      }
    })();
    if (runtime && typeof runtime.waitUntil === "function") {
      runtime.waitUntil(work);
    }

    return new Response(JSON.stringify({ jobId }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-plot handler error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

