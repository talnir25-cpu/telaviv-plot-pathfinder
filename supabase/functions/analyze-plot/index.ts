// Urban Renewal feasibility analyst — calls Lovable AI Gateway
// CORS handled manually (compatible with all SDK versions)

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
    max_far: number;
    max_floors_above: number;
    max_floors_roof: number | null;
    density_coefficient_sqm_per_unit: number;
    min_unit_size_sqm: number | null;
    setback_front_m: number | null;
    setback_side_m: number | null;
    setback_rear_m: number | null;
    tama38_far_bonus: number;
    pinui_far_bonus: number;
    rova_plan_far_bonus: number;
    tama38_units_bonus_pct: number;
    pinui_units_bonus_pct: number;
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

type RenewalTrack = "local_renewal" | "pinui_binui" | "rova_plan";
interface RenewalSetbackStandard {
  front: number; side: number; rear: number;
  tenantShareOfUpliftPct: number; source: string;
}
const RENEWAL_SETBACKS: Record<3 | 4, Record<RenewalTrack, RenewalSetbackStandard>> = {
  3: {
    local_renewal: { front: 4, side: 2.5, rear: 4, tenantShareOfUpliftPct: 25, source: "תכנית מקומית — הקלות ועדה מקומית (רובע 3)" },
    pinui_binui: { front: 3, side: 2, rear: 3, tenantShareOfUpliftPct: 40, source: "תכנית פינוי-בינוי נקודתית (רובע 3)" },
    rova_plan: { front: 4, side: 2.5, rear: 4, tenantShareOfUpliftPct: 30, source: "תקנון רובע 3 — מסלול התחדשות" },
  },
  4: {
    local_renewal: { front: 4, side: 3, rear: 5, tenantShareOfUpliftPct: 25, source: "תכנית מקומית — הקלות ועדה מקומית (רובע 4)" },
    pinui_binui: { front: 3, side: 2.5, rear: 4, tenantShareOfUpliftPct: 40, source: "תכנית פינוי-בינוי נקודתית (רובע 4)" },
    rova_plan: { front: 4, side: 3, rear: 5, tenantShareOfUpliftPct: 30, source: "תקנון רובע 4 — מסלול התחדשות" },
  },
};
const RENEWAL_TRACK_LABEL: Record<RenewalTrack, string> = {
  local_renewal: "תכנית מקומית / הקלות ועדה",
  pinui_binui: "פינוי-בינוי",
  rova_plan: "תכנית רובעית",
};

function inferRenewalTrack(existingFloors: number, existingUnits: number, conservation: boolean, buildingYear?: number): RenewalTrack {
  // ברירת מחדל: rova_plan — המסלול הסטטוטורי הפעיל בת"א רובעים 3/4 לאחר פקיעת תמ"א 38 (10/2022).
  if (conservation) return "rova_plan";
  if (existingFloors >= 5 || existingUnits >= 12) return "pinui_binui";
  if (buildingYear != null && buildingYear < 1980) return "local_renewal";
  return "rova_plan";
}


const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "render_feasibility_report",
    description: "Return a structured urban-renewal feasibility report for a Tel Aviv plot.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["high_potential", "medium_potential", "high_risk", "blocked"],
          description: "Overall feasibility status",
        },
        statusLabel: { type: "string", description: "Hebrew label for the status badge" },
        headline: { type: "string", description: "One sentence headline summary in Hebrew" },
        existing: {
          type: "object",
          properties: {
            units: { type: "number" },
            floors: { type: "number" },
            builtAreaSqm: { type: "number" },
            far: { type: "number", description: "Floor Area Ratio" },
          },
          required: ["units", "floors", "builtAreaSqm", "far"],
          additionalProperties: false,
        },
        proposed: {
          type: "object",
          properties: {
            units: { type: "number" },
            floors: { type: "number" },
            builtAreaSqm: { type: "number" },
            far: { type: "number" },
            heightMeters: { type: "number" },
          },
          required: ["units", "floors", "builtAreaSqm", "far", "heightMeters"],
          additionalProperties: false,
        },
        metrics: {
          type: "object",
          properties: {
            multiplier: { type: "number", description: "New units / Existing units" },
            newUnits: { type: "number", description: "Net additional units" },
            estimatedSellableArea: { type: "number", description: "Estimated sellable area in sqm" },
            avgUnitSize: { type: "number" },
          },
          required: ["multiplier", "newUnits", "estimatedSellableArea", "avgUnitSize"],
          additionalProperties: false,
        },
        zoning: {
          type: "object",
          properties: {
            maxHeightMeters: { type: "number" },
            maxFloors: { type: "number" },
            frontSetbackM: { type: "number" },
            sideSetbackM: { type: "number" },
            rearSetbackM: { type: "number" },
            maxFAR: { type: "number" },
            source: { type: "string", description: "PDF document cited" },
            treesOnPlot: { type: ["number", "null"], description: "Estimated number of trees on the plot (tree survey)" },
            treesForConservation: { type: ["number", "null"], description: "Of those, trees designated for preservation per Forest Ordinance" },
            parkingStandardPerUnit: { type: ["number", "null"], description: "Required parking spaces per dwelling unit per TA parking policy" },
            requiredBasementFloors: { type: ["number", "null"], description: "Estimated underground parking floors required" },
            todReliefApplies: { type: ["boolean", "null"], description: "Whether TOD parking relief applies (proximity to light rail / mass transit)" },
            groundwaterDepthM: { type: ["number", "null"], description: "Estimated groundwater table depth in meters below surface" },
            dewateringRequired: { type: ["boolean", "null"], description: "Whether basement excavation will require dewatering" },
          },
          required: ["maxHeightMeters", "maxFloors", "frontSetbackM", "sideSetbackM", "rearSetbackM", "maxFAR", "source", "treesOnPlot", "treesForConservation", "parkingStandardPerUnit", "requiredBasementFloors", "todReliefApplies", "groundwaterDepthM", "dewateringRequired"],
          additionalProperties: false,
        },

        redFlags: {
          type: "array",
          items: {
            type: "object",
            properties: {
              level: { type: "string", enum: ["critical", "warning", "info"] },
              title: { type: "string" },
              description: { type: "string" },
              source: { type: "string" },
            },
            required: ["level", "title", "description", "source"],
            additionalProperties: false,
          },
        },
        committeeSummary: {
          type: "string",
          description: "3-5 sentence Investment Committee summary in Hebrew",
        },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "List of PDF documents cited",
        },
      },
      required: [
        "status",
        "statusLabel",
        "headline",
        "existing",
        "proposed",
        "metrics",
        "zoning",
        "redFlags",
        "committeeSummary",
        "sources",
      ],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `אתה אנליסט בכיר להתחדשות עירונית, מומחה לתל אביב (רובעים 3 ו-4).
המטרה: לספק הערכת היתכנות מהירה ומבוססת נתונים ליזמי נדל"ן.

מסמכי המקור הזמינים:
- "תקנון רובע 3 (תא/3616א)" — חל על רובע 3
- "תקנון רובע 4 (תא/3729א)" — חל על רובע 4
- "תכנית מתאר תא/5000" — תכנית מתאר עירונית
- "מסמך מדיניות חניה ת"א, מהדורה 8" — חניה ופיתוח מגרש
- "תכנית מתאר מקומית ת"א — מרתפים"

עקרונות חישוב מקובלים (כשאין נתון מדויק):
- רובע 3 ו-4: זכויות בנייה טיפוסיות 200%-280% (כולל מרפסות), עד 6-8 קומות + קומת גג חלקית
- מכפיל יח"ד טיפוסי בפינוי-בינוי: 2.5x-4x; בתכנית רובעית: 1.5x-2.3x; בתכנית מקומית/הקלות ועדה: 1.3x-1.8x
- שטח דירה ממוצע מוצע: 90-110 מ"ר ברוטו
- חזית מסחרית מותרת לאורך רחובות מסחר ראשיים
- ברובעים 3 ו-4 קיימת מגבלת חניה משמעותית; אין בריכות; ללא גימור עץ/אבן בגדרות

דגלים אדומים שיש לזהות תמיד:
1. שימור (מבני שימור / איזור הכרזת UNESCO ב"עיר הלבנה")
2. מגבלות חניה (סעיפים 10-12 במדיניות החניה) — בפרט אם נדרשים 3+ מרתפי חניה
3. גודל מגרש קטן מ-500 מ"ר → מגביל משמעותית התחדשות
4. מגרש פינתי / חזית מסחרית → השפעה על קווי בניין
5. עצים לשימור (פקודת היערות) — דגל אם משוער שיש עצים בוגרים במעטפת הבנייה; ציין שנדרש סקר עצים מוסמך וכופר/העתקה (~₪15-50K לעץ)
6. השפלת מי תהום — דגל אם מתוכננים 2+ מרתפים באזורים עם מי תהום גבוהים (ברובעים 3-4 בקרבת הים/ירקון העומק יכול להיות 3-6 מ׳); תוספת עלות ~₪200-500/מ"ר חפירה + רישוי רשות המים

אילוצים פיזיים-רגולטוריים — חובה לאכלס בשדה zoning:
- treesOnPlot / treesForConservation: הערכה לפי גודל המגרש וטיפוס בנייה (ברובעים ותיקים טיפוסי 2-6 עצים בוגרים). אם לא ידוע — null.
- parkingStandardPerUnit: ברובעים 3-4 בת"א הטווח 0.7-1.2 מק׳ ליח״ד; בקרבת הרכבת הקלה (TOD) מותרת הקלה ל-0.5-0.7.
- requiredBasementFloors: חשב לפי יח״ד מוצעות × תקן חניה ÷ ~25 מקומות לקומת מרתף.
- todReliefApplies: true אם החלקה בטווח ~500 מ׳ מתחנת רכבת קלה / רכבת.
- groundwaterDepthM: באזורים מערביים בת"א טיפוסי 3-6 מ׳; באזורים מזרחיים 8-15 מ׳.
- dewateringRequired: true אם עומק חפירה (מרתפים × 3 מ׳) ≥ עומק מי תהום.

כללי תקדים גיאוגרפיים (חובה לאכוף):
- רובע 3 דרום-הים (גושים 6111, 6112, 6113): מגבלת גובה ~27 מ׳ ≈ 8 קומות; מרחק מהים < 300 מ׳ → עומק מי תהום 3-5 מ׳ → dewateringRequired כמעט תמיד true למרתף 2+.
- רובע 4 צפון (גושים 6213+, צפון יהודה המכבי): עד 35 מ׳ ≈ 10 קומות.
- רובע 3 צפון-מרכזי (גושים 6109-6110): עד 30 מ׳ ≈ 9 קומות.

כללי היתכנות מסלול (חובה לאכוף):
- אם existingFloors ≥ 5 — הצע פינוי-בינוי או תכנית רובעית בלבד וסמן status="high_risk" אם plotArea < 800 מ"ר. (תמ"א 38 פקעה 10/2022.)
- אם plotArea < 500 מ"ר ו-existingUnits < 6 — סמן status="high_risk" עם red flag על קושי לעבור סף כלכלי לפינוי-בינוי.
- אם treesForConservation > 0 וגם המגרש פינתי (notes מציינים פינתי/חזית כפולה) — הוסף red flag warning על מורכבות תכנון מעטפת.

הוראות פלט:
- תמיד החזר באמצעות הכלי render_feasibility_report
- כל המספרים ריאליסטיים ומבוססים על המסמכים
- ציין מקור ספציפי בכל red flag ובשדה sources
- אם נתון חסר — ציין "נדרשת בדיקה ידנית בתיק מהנדס העיר" בתיאור הדגל המתאים
- כתוב בעברית מקצועית ותמציתית`;


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
          }),
        });
        if (zResp.ok) zoneInfo = await zResp.json();
        else console.warn("lookup-zone-info non-OK", zResp.status, await zResp.text());
      }
    } catch (e) {
      console.warn("lookup-zone-info failed (non-fatal)", e);
    }

    const builtAreaLine = body.existingBuiltAreaSqm && body.existingBuiltAreaSqm > 0
      ? `שטח בנוי קיים (מדוד ממקור: ${body.existingBuiltAreaSource ?? "לא ידוע"}, אמינות: ${body.existingBuiltAreaConfidence ?? "לא ידוע"}): ${body.existingBuiltAreaSqm} מ"ר — השתמש בערך הזה ישירות כ-existing.builtAreaSqm; אל תאמוד מחדש.`
      : `שטח בנוי קיים: לא ידוע — חשב לפי existingUnits × ~85 מ"ר`;


    const plotAreaForCalc = body.area ?? body.shapeArea ?? 0;
    const hasSetbacks =
      body.frontSetbackM != null && body.sideSetbackM != null && body.rearSetbackM != null;
    const typicalFloorArea = hasSetbacks && plotAreaForCalc > 0
      ? estimateTypicalFloorArea(plotAreaForCalc, {
          front: body.frontSetbackM!,
          side: body.sideSetbackM!,
          rear: body.rearSetbackM!,
        }, body.plotWidthM, body.plotDepthM)
      : 0;
    const coveragePctVal = typicalFloorArea && plotAreaForCalc
      ? Math.round((typicalFloorArea / plotAreaForCalc) * 100)
      : 0;

    // ── חישוב פוטנציאל הגדלת תכסית בהליך התחדשות (דטרמיניסטי) ──
    const renewalTrack = inferRenewalTrack(body.existingFloors ?? 0, body.existingUnits ?? 0, body.conservation, body.buildingYear);
    const renewalCfg = plotAreaForCalc > 0 ? RENEWAL_SETBACKS[body.quarter]?.[renewalTrack] : null;
    const renewalFloorArea = renewalCfg
      ? estimateTypicalFloorArea(plotAreaForCalc, renewalCfg, body.plotWidthM, body.plotDepthM)
      : 0;
    const renewalCoveragePct = renewalFloorArea && plotAreaForCalc
      ? Math.round((renewalFloorArea / plotAreaForCalc) * 100)
      : 0;
    const baselineFloorAreaForUplift = typicalFloorArea > 0
      ? typicalFloorArea
      : (plotAreaForCalc > 0 ? estimateTypicalFloorArea(plotAreaForCalc, { front: 5, side: 3, rear: 5 }, body.plotWidthM, body.plotDepthM) : 0);
    const upliftSqmPerFloor = Math.max(0, renewalFloorArea - baselineFloorAreaForUplift);
    const upliftPct = baselineFloorAreaForUplift > 0
      ? Math.round((upliftSqmPerFloor / baselineFloorAreaForUplift) * 100)
      : 0;

    const setbacksLine = hasSetbacks
      ? `\nקווי בניין (מקור: ${body.setbackSource === "regulation" ? "תקנון רובע" : "הזנת משתמש"}):
  קדמי ${body.frontSetbackM} מ׳ / צדדי ${body.sideSetbackM} מ׳ / אחורי ${body.rearSetbackM} מ׳
שטח קומה טיפוסי מירבי (קירוב מלבני): ~${typicalFloorArea} מ"ר (תכסית ~${coveragePctVal}%)

אילוץ קשיח: proposed.builtAreaSqm ≤ ${typicalFloorArea} × proposed.floors
אם FAR שאיפתי דורש שטח גדול יותר — הגדל את floors (עד maxFloors) ולא את השטח לקומה.
החזר ב-zoning.frontSetbackM/sideSetbackM/rearSetbackM את הערכים שקיבלת.`
      : "";

    const renewalLine = renewalFloorArea > 0
      ? `\nפוטנציאל הגדלת תכסית בהליך התחדשות (${RENEWAL_TRACK_LABEL[renewalTrack]}):
  קווי בניין מוקלים: קדמי ${renewalCfg!.front} / צדדי ${renewalCfg!.side} / אחורי ${renewalCfg!.rear} מ׳
  שטח קומה פוטנציאלי: ~${renewalFloorArea} מ"ר (תכסית ~${renewalCoveragePct}%, דלתא +${upliftSqmPerFloor} מ"ר/קומה ≈ +${upliftPct}%)
  התייחס בסיכום לוועדה ובדגלים אם הפער משמעותי.`
      : "";



    const userPrompt = `נתח את ההיתכנות להתחדשות עירונית של החלקה הבאה:

רובע: ${body.quarter}
גוש: ${body.gush}
חלקה: ${body.helka}
שטח רשום: ${body.area ?? "לא ידוע"} מ"ר
שטח לפי GIS: ${body.shapeArea ?? "לא ידוע"} מ"ר
מספר יח"ד קיימות: ${body.existingUnits}
מספר קומות קיים: ${body.existingFloors}
${builtAreaLine}
סטטוס שימור (לפי המשתמש): ${body.conservation ? "כן" : "לא ידוע / לא"}
${body.conservationDetails ? `פרטי שימור (GIS עיריית ת״א):
  - שם המבנה: ${body.conservationDetails.buildingName ?? "לא צוין"}
  - רמת שימור: ${body.conservationDetails.level ?? "לא צוינה"}${body.conservationDetails.strictRestrictions ? " (הגבלות מחמירות — גם הפנים מוגן)" : " (שימור חיצוני בלבד — חזיתות)"}
  - תכנית: ${body.conservationDetails.planRef ?? "תא/2650/ב"}
  - מתחם UNESCO: ${body.conservationDetails.inUnescoBuffer ? "כן" : "לא"}
  - תיאור רשמי: ${body.conservationDetails.description ?? "—"}
  - הנחיה לאנליסט: ${body.conservationDetails.strictRestrictions
    ? "שימור מחמיר חוסם תוספת קומות משמעותית — הצע נתיב פינוי-בינוי על המגרש או שימור-בנייה משולב"
    : "שימור חיצוני מאפשר תוספת קומות מעל המבנה הקיים — בחן נתיב תמ״א 38/2 או תכנית רובע עם שימור חזיתות"}` : ""}
${body.notes ? `הערות נוספות: ${body.notes}` : ""}${setbacksLine}${renewalLine}


החזר דוח היתכנות מלא ומובנה דרך הכלי render_feasibility_report.
חשב את המכפיל, יח"ד חדשות, שטח מכירה משוער, וזהה דגלים אדומים רלוונטיים.`;

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY missing");
    }

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools: [{
          name: ANALYSIS_TOOL.function.name,
          description: ANALYSIS_TOOL.function.description,
          input_schema: ANALYSIS_TOOL.function.parameters,
        }],
        tool_choice: { type: "tool", name: "render_feasibility_report" },
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("Anthropic error:", aiResp.status, t);
      if (aiResp.status === 429) {
        throw new Error("חרגת ממכסת בקשות בדקה — נסה שוב בעוד רגע");
      }
      throw new Error(`Anthropic error ${aiResp.status}: ${t.slice(0, 300)}`);
    }

    const aiJson = await aiResp.json();
    const toolCall = Array.isArray(aiJson?.content)
      ? aiJson.content.find((b: { type: string }) => b.type === "tool_use")
      : null;
    if (!toolCall?.input) {
      console.error("No tool_use in response", JSON.stringify(aiJson));
      throw new Error("AI did not return structured report");
    }

    // deno-lint-ignore no-explicit-any
    const report: any = toolCall.input;


    // ── Post-validation: deterministic sanity checks on AI output ──
    try {
      report.redFlags = Array.isArray(report.redFlags) ? report.redFlags : [];

      // ── Tabu-derived active renewal warning (highest priority red flag) ──
      if (body.tabuAnalysis?.hasActiveRenewal) {
        const party = body.tabuAnalysis.renewalParty?.trim() || "יזם לא מזוהה";
        report.redFlags.unshift({
          level: "critical",
          title: "⚠️ בניין בהליך התחדשות פעיל",
          description: `בניין זה נמצא בהליך התחדשות פעיל עם ${party}. יש לבדוק את סטטוס ההליך לפני ניתוח היתכנות.`,
          source: "נסח טאבו",
        });
        if (report.status === "high_potential") report.status = "high_risk";
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

      // אם המשתמש העביר שטח בנוי מדוד — דורסים את אומדן ה-AI
      if (body.existingBuiltAreaSqm && body.existingBuiltAreaSqm > 0) {
        if (!report.existing) report.existing = {};
        report.existing.builtAreaSqm = body.existingBuiltAreaSqm;
        const plotArea = body.area ?? body.shapeArea ?? 0;
        if (plotArea > 0) {
          report.existing.far = Number((body.existingBuiltAreaSqm / plotArea).toFixed(2));
        }
      }


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

      if (body.existingFloors >= 5 && plotArea > 0 && plotArea < 800 && report.status === "high_potential") {
        report.status = "medium_potential";
      }

      // ── ולידציית תכסית: האם ה-FAR המוצע ריאלי גיאומטרית? ──
      if (hasSetbacks && typicalFloorArea > 0) {
        if (!report.zoning) report.zoning = {};
        report.zoning.frontSetbackM = body.frontSetbackM;
        report.zoning.sideSetbackM = body.sideSetbackM;
        report.zoning.rearSetbackM = body.rearSetbackM;
        report.zoning.typicalFloorAreaSqm = typicalFloorArea;
        // תכסית תכנונית (מעטפת קווי בניין) — בסיס לחישוב floorsNeededForFAR ו-uplift
        report.zoning.coveragePct = coveragePctVal;
        report.zoning.setbackSource = body.setbackSource ?? "regulation";

        // תכסית קיימת מ-GIS עיריית תל אביב — ערך עובדתי נפרד (לא דורס את התכנונית)
        if (body.coverageReliable === true && typeof body.coverageExact === "number" && body.coverageExact > 0) {
          report.zoning.coverageExistingPct = body.coverageExact;
          if (typeof body.buildingFootprint === "number" && body.buildingFootprint > 0) {
            report.zoning.buildingFootprintSqm = body.buildingFootprint;
          }
          report.zoning.coverageSource = body.coverageStatus ?? "GIS עיריית תל אביב — שכבות 524/513";
          if (!Array.isArray(report.sources)) report.sources = [];
          const srcLine = body.coverageStatus ?? "GIS עיריית תל אביב — שכבות 524/513";
          if (!report.sources.includes(srcLine)) report.sources.push(srcLine);

          // red-flag: חריגה היסטורית של המבנה הקיים מעבר למעטפת הסטטוטורית
          if (body.coverageExact > coveragePctVal + 5) {
            report.redFlags.push({
              level: "warning",
              title: "חריגה היסטורית מהמעטפת הסטטוטורית",
              description: `תכסית קיימת ${body.coverageExact}% גבוהה מהתכסית התכנונית ${coveragePctVal}% (קווי בניין). ייתכן שהמבנה הקיים נבנה בהיתר חורג או לפני התקנון הנוכחי — נדרשת בדיקה משפטית/תכנונית לפני שימוש בזכויות.`,
              source: "השוואת GIS מול תקנון",
            });
          }
        }

        const proposedBuilt = report.proposed?.builtAreaSqm ?? 0;
        const proposedFloorsVal = report.proposed?.floors ?? 0;
        const maxFloorsVal = report.zoning?.maxFloors ?? 0;
        const floorsNeeded = Math.ceil(proposedBuilt / typicalFloorArea);
        report.zoning.floorsNeededForFAR = floorsNeeded;

        const srcLabel = body.setbackSource === "regulation"
          ? "תקנון רובע"
          : "הזנת משתמש";
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
            description: `נדרשות ${floorsNeeded} קומות לתמיכה בשטח המוצע (${proposedBuilt} מ"ר), אך מקסימום הקומות לפי תקנון הוא ${maxFloorsVal}. ה-FAR השאיפתי אינו ניתן למימוש בקווי הבניין הנוכחיים.`,
            source: srcTag,
          });
          report.status = "blocked";
        } else if (proposedFloorsVal > floorsNeeded * 1.5 && floorsNeeded > 0) {
          report.redFlags.push({
            level: "info",
            title: "ניצול חסר של תכסית",
            description: `${proposedFloorsVal} קומות מוצעות עבור שטח שניתן להכיל ב-${floorsNeeded} קומות בלבד — ייתכן שכדאי לבחון תכנון נמוך וקומפקטי יותר.`,
            source: srcTag,
          });
        }
      }

      // ── אכלוס פוטנציאל הגדלת תכסית בהליך התחדשות ──
      if (renewalFloorArea > 0 && renewalCfg && upliftSqmPerFloor > 0) {
        const proposedFloorsForUplift = report.proposed?.floors ?? 0;
        // מקדם מימוש מציאותי: מתחיל ב-1.0, מנוכים אילוצים
        let realization = 1.0;
        if ((report.zoning?.treesForConservation ?? 0) > 0) realization -= 0.15;
        if (body.conservation) realization -= 0.10;
        if ((report.zoning?.requiredBasementFloors ?? 0) > 1) realization -= 0.10;
        realization = Math.max(0.5, Math.min(1.0, realization));

        const effectiveUpliftSqmTotal = Math.round(
          upliftSqmPerFloor * proposedFloorsForUplift * realization,
        );

        if (!report.zoning) report.zoning = {};
        report.zoning.renewalPotential = {
          track: renewalTrack,
          trackLabel: RENEWAL_TRACK_LABEL[renewalTrack],
          frontSetbackM: renewalCfg.front,
          sideSetbackM: renewalCfg.side,
          rearSetbackM: renewalCfg.rear,
          typicalFloorAreaSqm: renewalFloorArea,
          coveragePct: renewalCoveragePct,
          upliftSqmPerFloor,
          upliftPct,
          realizationFactor: Number(realization.toFixed(2)),
          effectiveUpliftSqmTotal,
          tenantShareOfUpliftPct: renewalCfg.tenantShareOfUpliftPct,
          source: renewalCfg.source,
        };

        // RedFlag חיובי אם הפער משמעותי
        const existingBuiltForFlag = report.existing?.builtAreaSqm ?? 0;
        if (existingBuiltForFlag > 0 && effectiveUpliftSqmTotal > existingBuiltForFlag * 0.3) {
          report.redFlags.push({
            level: "info",
            title: "פוטנציאל הגדלת תכסית בהליך התחדשות",
            description: `מסלול ${RENEWAL_TRACK_LABEL[renewalTrack]}: תכסית פוטנציאלית ~${renewalCoveragePct}% (לעומת בסיס ~${coveragePctVal || "?"}%), תוספת אפקטיבית של ${effectiveUpliftSqmTotal.toLocaleString("he-IL")} מ"ר כולל — מקור משמעותי לתמורה לדיירים.`,
            source: renewalCfg.source,
          });
        }
      }

      // ── חישוב דטרמיניסטי של היקף הבנייה המוצעת ──
      // מקור עדיפות 1: zoneInfo מהתקנון (lookup-zone-info)
      // מקור עדיפות 2 (fallback): zoning של ה-AI + מכפיל מסלול
      try {
        const plotAreaDet = body.area ?? body.shapeArea ?? 0;
        const SELLABLE_RATIO = 0.78;    // ברוטו → נטו מכירה
        const FLOOR_HEIGHT_M = 3.2;

        // מיפוי מסלול → שם השדה בטבלת zoning_rights
        // מיפוי מסלול → שם השדה בטבלת zoning_rights.
        // הערה: עמודות tama38_far_bonus/tama38_units_bonus_pct ב-DB משמשות כיום כייצוג של
        // הקלות ועדה מקומית בתכנית מקומית (חלופי לתמ"א 38 שפקעה 10/2022).
        const TRACK_TO_BONUS_KEY: Record<RenewalTrack, "tama38" | "pinui" | "rova_plan"> = {
          local_renewal: "tama38",
          pinui_binui: "pinui",
          rova_plan: "rova_plan",
        };

        let calcSource: any = null;

        if (zoneInfo && plotAreaDet > 0 && zoneInfo.rights.density_coefficient_sqm_per_unit > 0) {
          // ───────── מסלול מבוסס תקנון ─────────
          const r = zoneInfo.rights;
          const bonusKey = TRACK_TO_BONUS_KEY[renewalTrack];
          const farBonus = Number(((r as any)[`${bonusKey}_far_bonus`]) ?? 0);

          // ⚠️ הערה: לא מכפילים ב-units_bonus_pct.
          // ה-far_bonus כבר מגדיל את שטח הבנייה, וכמות יח"ד נגזרת ממנו דרך
          // מקדם הצפיפות. הכפלה נוספת ב-units_bonus_pct הייתה ספירה כפולה.

          const effectiveFAR = (r.max_far + farBonus) / 100;
          const maxFloorsDet = (r.max_floors_above ?? 0) + (r.max_floors_roof ?? 0);
          const floorAreaEff = renewalFloorArea > 0 ? renewalFloorArea : typicalFloorArea;

          const byFAR = plotAreaDet * effectiveFAR;

          // כיוון ג: FAR עם תקרת תכסית
          // שטח קומה מקסימלי = שטח מגרש × תכסית מותרת
          // שטח בנייה לפי תכסית = שטח קומה מקסימלי × קומות
          // במסלול תכנית רבעית (rova_plan): התקרה היא תכסית × קומות בלבד; FAR אינו חוסם.
          // בשאר המסלולים: שטח בנייה סופי = min(לפי FAR, לפי תכסית).
          const coveragePct = r.max_coverage_pct;
          const hasCoverage = coveragePct != null && coveragePct > 0 && maxFloorsDet > 0;

          if (!hasCoverage && r.density_coefficient_sqm_per_unit > 0 && renewalTrack !== "rova_plan") {
            report.redFlags.push({
              level: "info",
              title: "בדיקת תקרת תכסית לא בוצעה",
              description: "נתון תכסית מקסימלית חסר בתקנון לאזור זה. שטח הבנייה המוצע מוגבל לפי FAR בלבד.",
              source: "בדיקת שלמות אוטומטית — zoning_rights",
            });
          }
          if (!hasCoverage && renewalTrack === "rova_plan") {
            report.redFlags.push({
              level: "critical",
              title: "תכסית חסרה — לא ניתן לחשב זכויות במסלול רובעי",
              description: "במסלול תכנית רבעית הזכויות נגזרות מתכסית × קומות בלבד. נתון התכסית חסר בתקנון לאזור זה — לא ניתן לחשב את שטח הבנייה האפשרי. נדרש השלמת הנתון בטבלת zoning_rights או בדיקה ידנית.",
              source: "בדיקת שלמות אוטומטית — zoning_rights (rova_plan)",
            });
            report.status = "blocked";
          }

          const byCoverage = hasCoverage
            ? Math.round(plotAreaDet * (coveragePct! / 100)) * maxFloorsDet
            : byFAR; // לא רלוונטי ב-rova_plan ללא תכסית — מטופל לעיל

          let proposedBuilt: number;
          let limitingFactor: string;
          if (renewalTrack === "rova_plan") {
            // חסר תכסית → 0 (כבר נרשם blocked + critical flag); אחרת תכסית × קומות
            proposedBuilt = hasCoverage ? Math.round(byCoverage) : 0;
            limitingFactor = hasCoverage ? "coverage" : "coverage_missing";
          } else {
            proposedBuilt = Math.round(Math.min(byFAR, byCoverage));
            limitingFactor = byCoverage < byFAR ? "coverage" : "far";
          }



          // מספר הקומות המוצע = המקסימום המותר לפי התקנון (לא נגזרת של שטח)
          const proposedFloorsDet = Math.max(maxFloorsDet, 1);

          const heightDet = Math.round(proposedFloorsDet * FLOOR_HEIGHT_M * 10) / 10;

          // יח"ד דטרמיניסטי: שטח בנייה מותר ÷ מקדם הצפיפות מהתקנון
          const unitsByDensity = Math.floor(proposedBuilt / r.density_coefficient_sqm_per_unit);

          // הגבלה לפי מינימום שטח חוקי לדירה — מונע ספירת יח"ד שלא ניתנות למימוש
          // בפועל בגלל אילוץ גודל דירה מינימלי. חיתוך זה חל רק אם min_unit_size_sqm
          // קיים וגדול ממקדם הצפיפות (כלומר המקדם "אופטימי" יותר מהמינימום החוקי).
          const minUnitSize = r.min_unit_size_sqm;
          const unitsCappedByMinSize = minUnitSize && minUnitSize > r.density_coefficient_sqm_per_unit
            ? Math.floor(proposedBuilt / minUnitSize)
            : unitsByDensity;

          const unitsBeforeExistingFloor = Math.min(unitsByDensity, unitsCappedByMinSize);

          const proposedUnitsDet = Math.max(
            body.existingUnits ?? 0,
            unitsBeforeExistingFloor,
          );

          if (unitsCappedByMinSize < unitsByDensity) {
            report.redFlags.push({
              level: "warning",
              title: "מספר יח\"ד הוגבל לפי מינימום שטח דירה חוקי",
              description: `מקדם הצפיפות בתקנון (${r.density_coefficient_sqm_per_unit} מ"ר/יח"ד) קטן מהמינימום החוקי לדירה (${minUnitSize} מ"ר) באזור זה. ספירת היח"ד הוגבלה מ-${unitsByDensity} ל-${unitsCappedByMinSize} כדי לשקף את המקסימום הניתן למימוש בדירות בגודל החוקי המינימלי. אם בכוונתך תמהיל דירות לא-אחיד (חלק קטנות וחלק גדולות מהמינימום, בממוצע תקין), מספר היחידות בפועל עשוי להיות גבוה יותר — מומלץ אימות תכנוני נקודתי.`,
              source: "בדיקת שלמות אוטומטית — zoning_rights (density_coefficient_sqm_per_unit מול min_unit_size_sqm)",
            });
          }
          // הערה: בונוס יחידות לא מחושב כשדה נפרד — הוא כבר מגולם בהגדלת proposedBuilt
          // באמצעות far_bonus (ר' למעלה), ומשם נגזר ל-proposedUnitsDet דרך מקדם הצפיפות.
          // unitsBonusPct נשאר 0 בכוונה כדי שלא תיווצר ספירה כפולה.
          const unitsBonusPct = 0;

          const sellableArea = proposedBuilt * SELLABLE_RATIO;

          // טווח יחידות דיור לפי תמהיל — ברירת מחדל אחידה, ניתן להרחיב לפי רובע/אזור
          const UNIT_MIX_DEFAULT = { min: 95, base: 78, max: 60 }; // מ"ר ממוצע לדירה
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
            ...(report.proposed ?? {}),
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
            ...(report.metrics ?? {}),
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
            base_far_pct: r.max_far,
            far_bonus_pct: farBonus,
            effective_far_pct: r.max_far + farBonus,
            density_coefficient_sqm_per_unit: r.density_coefficient_sqm_per_unit,
            units_bonus_pct: unitsBonusPct,
            max_floors: maxFloorsDet,
            renewal_track: renewalTrack,
            renewal_track_label: RENEWAL_TRACK_LABEL[renewalTrack],
            coverage_pct_used: coveragePct ?? null,
            built_area_limiting_factor: limitingFactor,
          };
        } else {
          // ───────── Fallback: חישוב מבוסס שטח ורובע ─────────
          // נכנס לפעולה רק כשלא נמצאה שורה בטבלת zoning_rights.
          // משתמש במקדמי צפיפות ידועים לפי רובע במקום מכפיל גס.
          const maxFAR = Number(report.zoning?.maxFAR ?? 0);
          const maxFloorsDet = Number(report.zoning?.maxFloors ?? 0);
          const maxHeightDet = Number(report.zoning?.maxHeightMeters ?? 0);
          const floorAreaEff = renewalFloorArea > 0 ? renewalFloorArea : typicalFloorArea;

          if (plotAreaDet > 0 && maxFAR > 0 && maxFloorsDet > 0 && floorAreaEff > 0) {

            // מקדם צפיפות לפי רובע — מבוסס תקנונים תא/3616א ותא/3729א
            // רובע 3: 80 מ"ר לדירה (ממוצע מגורים ב/ג)
            // רובע 4: 80 מ"ר לדירה (ברירת מחדל שאר הרחובות)
            const FALLBACK_DENSITY: Record<number, number> = { 3: 80, 4: 80 };
            const quarter = Number(body.quarter ?? 0);
            const densityCoeff = FALLBACK_DENSITY[quarter] ?? 85;

            const byFAR = plotAreaDet * maxFAR;
            const byEnvelope = floorAreaEff * maxFloorsDet;
            const proposedBuilt = Math.round(Math.min(byFAR, byEnvelope));

            const proposedFloorsDet = Math.min(
              maxFloorsDet,
              Math.max(1, Math.ceil(proposedBuilt / floorAreaEff)),
            );

            const heightDet = Math.round(
              (maxHeightDet > 0
                ? Math.min(maxHeightDet, proposedFloorsDet * FLOOR_HEIGHT_M)
                : proposedFloorsDet * FLOOR_HEIGHT_M) * 10,
            ) / 10;

            // יח"ד = שטח בנייה ÷ מקדם צפיפות (לפי תקנון), לא פחות מהקיים
            const proposedUnitsDet = Math.max(
              body.existingUnits ?? 0,
              Math.floor(proposedBuilt / densityCoeff),
            );

            const sellableArea = proposedBuilt * SELLABLE_RATIO;

            // טווח יחידות דיור לפי תמהיל — ברירת מחדל אחידה, ניתן להרחיב לפי רובע/אזור
            const UNIT_MIX_DEFAULT = { min: 95, base: 78, max: 60 }; // מ"ר ממוצע לדירה
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
              ...(report.proposed ?? {}),
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
              ...(report.metrics ?? {}),
              multiplier: existingUnitsForMetrics > 0
                ? Number((proposedUnitsDet / existingUnitsForMetrics).toFixed(2))
                : 0,
              newUnits: Math.max(0, proposedUnitsDet - existingUnitsForMetrics),
              estimatedSellableArea: Math.round(sellableArea),
              avgUnitSize: proposedUnitsDet > 0
                ? Math.round(proposedBuilt / proposedUnitsDet)
                : densityCoeff,
            };

            calcSource = {
              method: "fallback_by_quarter",
              renewal_track: renewalTrack,
              renewal_track_label: RENEWAL_TRACK_LABEL[renewalTrack],
              density_coefficient_used: densityCoeff,
              note: "ייעוד לא נמצא בטבלת זכויות — שימוש במקדם צפיפות לפי רובע",
            };
          }
        }

        if (calcSource) {
          report.calculationSource = calcSource;
        }

      } catch (e) {
        console.error("deterministic proposed-compute error (non-fatal)", e);
      }
    } catch (e) {
      console.error("post-validation error (non-fatal)", e);
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

