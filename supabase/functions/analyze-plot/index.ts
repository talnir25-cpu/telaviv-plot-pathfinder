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
}

interface ZoneInfo {
  plan_code: string;
  zone_label: string;
  rights: {
    coverage_pct: number | null;
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

type RenewalTrack = "tama38_2" | "pinui_binui" | "rova_plan";
interface RenewalSetbackStandard {
  front: number; side: number; rear: number;
  tenantShareOfUpliftPct: number; source: string;
}
const RENEWAL_SETBACKS: Record<3 | 4, Record<RenewalTrack, RenewalSetbackStandard>> = {
  3: {
    tama38_2: { front: 4, side: 2.5, rear: 4, tenantShareOfUpliftPct: 25, source: 'תמ"א 38/2 — הקלות ועדה מקומית (רובע 3)' },
    pinui_binui: { front: 3, side: 2, rear: 3, tenantShareOfUpliftPct: 40, source: "תכנית פינוי-בינוי נקודתית (רובע 3)" },
    rova_plan: { front: 4, side: 2.5, rear: 4, tenantShareOfUpliftPct: 30, source: "תקנון רובע 3 — מסלול התחדשות" },
  },
  4: {
    tama38_2: { front: 4, side: 3, rear: 5, tenantShareOfUpliftPct: 25, source: 'תמ"א 38/2 — הקלות ועדה מקומית (רובע 4)' },
    pinui_binui: { front: 3, side: 2.5, rear: 4, tenantShareOfUpliftPct: 40, source: "תכנית פינוי-בינוי נקודתית (רובע 4)" },
    rova_plan: { front: 4, side: 3, rear: 5, tenantShareOfUpliftPct: 30, source: "תקנון רובע 4 — מסלול התחדשות" },
  },
};
const RENEWAL_TRACK_LABEL: Record<RenewalTrack, string> = {
  tama38_2: 'תמ"א 38/2 (הריסה ובנייה)',
  pinui_binui: "פינוי-בינוי",
  rova_plan: "תכנית רובעית",
};

function inferRenewalTrack(existingFloors: number, existingUnits: number, conservation: boolean, buildingYear?: number): RenewalTrack {
  if (conservation) return "rova_plan";
  if (buildingYear != null && buildingYear >= 1980) return "rova_plan";
  if (existingFloors >= 5 || existingUnits >= 12) return "pinui_binui";
  return "tama38_2";
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
- מכפיל יח"ד טיפוסי בפינוי-בינוי: 2.5x-4x; בתמ"א 38: 1.3x-2x
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
- אם existingFloors ≥ 5 — תמ"א 38/2 לא משתלמת כלכלית; הצע פינוי-בינוי בלבד וסמן status="high_risk" אם plotArea < 800 מ"ר.
- אם plotArea < 500 מ"ר ו-existingUnits < 6 — סמן status="high_risk" עם red flag על קושי לעבור סף כלכלי לפינוי-בינוי.
- אם treesForConservation > 0 וגם המגרש פינתי (notes מציינים פינתי/חזית כפולה) — הוסף red flag warning על מורכבות תכנון מעטפת.

הוראות פלט:
- תמיד החזר באמצעות הכלי render_feasibility_report
- כל המספרים ריאליסטיים ומבוססים על המסמכים
- ציין מקור ספציפי בכל red flag ובשדה sources
- אם נתון חסר — ציין "נדרשת בדיקה ידנית בתיק מהנדס העיר" בתיאור הדגל המתאים
- כתוב בעברית מקצועית ותמציתית`;


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as PlotInput;

    if (!body || !body.quarter || !body.gush || !body.helka) {
      return new Response(JSON.stringify({ error: "missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.existingUnits || body.existingUnits < 1) {
      return new Response(
        JSON.stringify({ error: "לא ניתן לחשב מכפיל ללא נתון על יח\"ד קיימות (existingUnits ≥ 1)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
${body.notes ? `הערות נוספות: ${body.notes}` : ""}${setbacksLine}${renewalLine}


החזר דוח היתכנות מלא ומובנה דרך הכלי render_feasibility_report.
חשב את המכפיל, יח"ד חדשות, שטח מכירה משוער, וזהה דגלים אדומים רלוונטיים.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-pro-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: "function", function: { name: "render_feasibility_report" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "חרגת ממכסת בקשות בדקה — נסה שוב בעוד רגע" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "אזל הקרדיט בחשבון Lovable AI — יש להוסיף קרדיט בהגדרות" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response", JSON.stringify(aiJson));
      return new Response(JSON.stringify({ error: "AI did not return structured report" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let report;
    try {
      report = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool args", e, toolCall.function.arguments);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Post-validation: deterministic sanity checks on AI output ──
    try {
      report.redFlags = Array.isArray(report.redFlags) ? report.redFlags : [];

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
        report.zoning.coveragePct = coveragePctVal;
        report.zoning.setbackSource = body.setbackSource ?? "regulation";

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
        const TRACK_TO_BONUS_KEY: Record<RenewalTrack, "tama38" | "pinui" | "rova_plan"> = {
          tama38_2: "tama38",
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
          const byEnvelope = floorAreaEff > 0 && maxFloorsDet > 0
            ? floorAreaEff * maxFloorsDet
            : byFAR; // אם אין נתון לתכסית — לא מגביל
          const proposedBuilt = Math.round(Math.min(byFAR, byEnvelope));

          const proposedFloorsDet = floorAreaEff > 0
            ? Math.min(Math.max(maxFloorsDet, 1), Math.max(1, Math.ceil(proposedBuilt / floorAreaEff)))
            : Math.max(maxFloorsDet, 1);

          const heightDet = Math.round(proposedFloorsDet * FLOOR_HEIGHT_M * 10) / 10;

          // יח"ד דטרמיניסטי: שטח בנייה מותר ÷ מקדם הצפיפות מהתקנון
          const proposedUnitsDet = Math.max(
            body.existingUnits ?? 0,
            Math.floor(proposedBuilt / r.density_coefficient_sqm_per_unit),
          );
          const unitsBonusPct = 0; // נשמר לתצוגה בלבד — לא בשימוש בחישוב

          const sellableArea = proposedBuilt * SELLABLE_RATIO;
          const farDet = Number((proposedBuilt / plotAreaDet).toFixed(2));

          report.proposed = {
            ...(report.proposed ?? {}),
            units: proposedUnitsDet,
            floors: proposedFloorsDet,
            builtAreaSqm: proposedBuilt,
            far: farDet,
            heightMeters: heightDet,
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
          };
        } else {
          // ───────── Fallback: חישוב ישן מבוסס AI ─────────
          const maxFAR = Number(report.zoning?.maxFAR ?? 0);
          const maxFloorsDet = Number(report.zoning?.maxFloors ?? 0);
          const maxHeightDet = Number(report.zoning?.maxHeightMeters ?? 0);
          const floorAreaEff = renewalFloorArea > 0 ? renewalFloorArea : typicalFloorArea;

          if (plotAreaDet > 0 && maxFAR > 0 && maxFloorsDet > 0 && floorAreaEff > 0) {
            const TRACK_MULTIPLIER: Record<RenewalTrack, number> = {
              tama38_2: 1.6,
              rova_plan: 2.3,
              pinui_binui: 3.0,
            };
            const AVG_UNIT_SIZE = 95;

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

            const multiplierDet = TRACK_MULTIPLIER[renewalTrack];
            const byMultiplier = Math.round((body.existingUnits ?? 0) * multiplierDet);
            const sellableArea = proposedBuilt * SELLABLE_RATIO;
            const byDensity = Math.floor(sellableArea / AVG_UNIT_SIZE);
            const proposedUnitsDet = Math.max(
              body.existingUnits ?? 0,
              Math.min(byMultiplier, byDensity),
            );

            const farDet = Number((proposedBuilt / plotAreaDet).toFixed(2));

            report.proposed = {
              ...(report.proposed ?? {}),
              units: proposedUnitsDet,
              floors: proposedFloorsDet,
              builtAreaSqm: proposedBuilt,
              far: farDet,
              heightMeters: heightDet,
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
                : AVG_UNIT_SIZE,
            };

            calcSource = {
              method: "ai_estimate",
              renewal_track: renewalTrack,
              renewal_track_label: RENEWAL_TRACK_LABEL[renewalTrack],
              multiplier_used: multiplierDet,
              note: "ייעוד לא נמצא בטבלת זכויות — נעשה שימוש בהערכת AI",
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





    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-plot error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
