// Financial feasibility — deterministic engine + AI for defaults only.
// Modes: "defaults" (AI suggests input values) | "analyze" (pure TS engine, no AI)

import { z } from "npm:zod@3.23.8";
import {
  assembleReport,
  type EngineInput,
  type ProjectType,
  type RenewalSubtype,
} from "../_shared/finance-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ───────── AI defaults (kept as-is) ─────────

const DEFAULTS_TOOL = {
  type: "function",
  function: {
    name: "suggest_financial_defaults",
    description: "Suggest realistic financial input defaults for a Tel Aviv urban renewal project.",
    parameters: {
      type: "object",
      properties: {
        avgSalePricePerSqm: { type: "number" },
        buildCostPerSqm: { type: "number" },
        softCostsPct: { type: "number" },
        vatPct: { type: "number" },
        loanInterestPct: { type: "number" },
        constructionMonths: { type: "number" },
        tenantRentPerMonth: { type: "number" },
        tenantEvacuationCost: { type: "number" },
        landValuePerSqm: { type: "number" },
        bettermentTaxPct: { type: "number" },
        rationale: { type: "string" },
      },
      required: [
        "avgSalePricePerSqm", "buildCostPerSqm", "softCostsPct", "vatPct",
        "loanInterestPct", "constructionMonths", "tenantRentPerMonth",
        "tenantEvacuationCost", "landValuePerSqm", "bettermentTaxPct", "rationale",
      ],
      additionalProperties: false,
    },
  },
};

const SYSTEM_DEFAULTS = `אתה אנליסט פיננסי בכיר לפרויקטי התחדשות עירונית בתל אביב (רובעים 3 ו-4).
ידע שוק (2026):
- מחיר מכירה ממוצע ברובעים 3-4: 50,000-75,000 ₪/מ"ר
- עלות בנייה Hard: 8,500-11,000 ₪/מ"ר
- Soft costs: 12-18% מ-Hard
- מע"מ: 18%
- ריבית מימון בנייה: 6-7.5% שנתי
- משך הקמה: 24-36 חודשים
- שכ"ד לדייר: 7,000-10,000 ₪/חודש
- פינוי חד-פעמי: 25,000-40,000 ₪/דייר
- היטל השבחה: 50% משווי ההשבחה
- שווי קרקע ברובעים 3-4: 35,000-55,000 ₪/מ"ר זכויות
החזר תמיד מספרים ריאליסטיים. כל הסכומים בשקלים.`;

// ───────── Zod schemas ─────────

const FinancialInputSchema = z.object({
  projectType: z.enum(["urban_renewal", "new_construction", "combination"]),
  renewalSubtype: z.enum(["tama38", "pinui_binui"]).optional(),
  developerLandSharePct: z.number().min(0).max(100).optional(),
  avgSalePricePerSqm: z.number().min(0).max(500_000),
  buildCostPerSqm: z.number().min(0).max(100_000),
  softCostsPct: z.number().min(0).max(100),
  vatPct: z.number().min(0).max(100),
  equity: z.number().min(0),
  loanInterestPct: z.number().min(0).max(50),
  constructionMonths: z.number().min(6).max(60),
  tenantRentPerMonth: z.number().min(0),
  tenantEvacuationCost: z.number().min(0),
  targetDeveloperProfitPct: z.number().min(0).max(100),
  landValuePerSqm: z.number().min(0).max(500_000),
  bettermentTaxPct: z.number().min(0).max(100),
  // construction-cost refinements
  finishLevel: z.enum(["standard", "premium", "luxury"]).optional(),
  basementCostMultiplier: z.number().min(0.4).max(1.2).optional(),
  basementAreaPerFloorRatio: z.number().min(0.5).max(1.0).optional(),
  demolitionCostPerSqm: z.number().min(0).max(5_000).optional(),
  siteDevelopmentCostPerSqmPlot: z.number().min(0).max(5_000).optional(),
  escalationPctPerYear: z.number().min(0).max(25).optional(),
  contingencyPct: z.number().min(0).max(25).optional(),
  constructionMode: z.enum(["full_rebuild", "addition_only"]).optional(),
  strengtheningCostPerSqm: z.number().min(0).max(20_000).optional(),
  // urban-renewal owners' return overrides (all optional)
  ownersReturnAreaSqm: z.number().min(0).max(1_000_000).optional(),
  ownersReturnBonusPerUnitSqm: z.number().min(0).max(80).optional(),
  minOwnerUnitSizeSqm: z.number().min(40).max(200).optional(),
  // detailed revenue (optional, passed through to engine)
  revenue: z.object({
    unitMix: z.array(z.object({
      type: z.enum(["studio","2room","3room","4room","5room","penthouse","garden"]),
      count: z.number().min(0),
      avgSizeSqm: z.number().min(0),
      pricePerSqm: z.number().min(0),
    })),
    floorPremiumPctPerFloor: z.number().min(0).max(5).optional(),
    penthousePremiumPct: z.number().min(0).max(100).optional(),
    storageUnitsCount: z.number().min(0).optional(),
    storagePricePerUnit: z.number().min(0).optional(),
    extraParkingCount: z.number().min(0).optional(),
    extraParkingPricePerUnit: z.number().min(0).optional(),
    commercialAreaSqm: z.number().min(0).optional(),
    commercialPricePerSqm: z.number().min(0).optional(),
    marketingDiscountPct: z.number().min(0).max(30).optional(),
    brokerageFeePct: z.number().min(0).max(10).optional(),
    absorptionRatePerMonth: z.number().min(0.5).optional(),
    priceEscalationPctPerYear: z.number().min(0).max(25).optional(),
  }).optional(),
});

const AnalyzeBodySchema = z.object({
  mode: z.literal("analyze"),
  plot: z.object({
    area: z.number().min(1),
    gush: z.number(),
    helka: z.number(),
    quarter: z.union([z.literal(3), z.literal(4)]),
  }),
  planning: z.object({
    existing: z.object({
      units: z.number().min(0),
      builtAreaSqm: z.number().min(0),
    }).passthrough(),
    proposed: z.object({
      units: z.number().min(0),
      builtAreaSqm: z.number().min(0),
      floors: z.number().min(0).optional(),
    }).passthrough(),
    metrics: z.object({
      estimatedSellableArea: z.number().min(0),
    }).passthrough(),
    zoning: z.object({
      treesForConservation: z.number().nullable().optional(),
      requiredBasementFloors: z.number().nullable().optional(),
      todReliefApplies: z.boolean().nullable().optional(),
      dewateringRequired: z.boolean().nullable().optional(),
      renewalPotential: z.object({
        track: z.enum(["tama38_2", "pinui_binui", "rova_plan"]),
        trackLabel: z.string(),
        effectiveUpliftSqmTotal: z.number(),
        tenantShareOfUpliftPct: z.number(),
      }).passthrough().nullable().optional(),
    }).passthrough().optional(),
  }).passthrough(),
  financial: FinancialInputSchema,
});

const DefaultsBodySchema = z.object({
  mode: z.literal("defaults"),
  quarter: z.union([z.literal(3), z.literal(4)]),
  gush: z.number(),
  helka: z.number(),
  plotArea: z.number().min(1),
  proposedUnits: z.number().min(0),
  proposedBuiltArea: z.number().min(0),
});

// ───────── handler ─────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const mode = body?.mode;

    // ── ANALYZE: pure deterministic engine ──
    if (mode === "analyze") {
      const parsed = AnalyzeBodySchema.safeParse(body);
      if (!parsed.success) {
        return new Response(
          JSON.stringify({
            error: "קלט לא תקין",
            details: parsed.error.flatten().fieldErrors,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { plot, planning, financial } = parsed.data;

      const engineInput: EngineInput = {
        projectType: financial.projectType as ProjectType,
        renewalSubtype: financial.renewalSubtype as RenewalSubtype | undefined,
        developerLandSharePct: financial.developerLandSharePct,
        plotArea: plot.area,
        existingBuiltAreaSqm: planning.existing.builtAreaSqm,
        proposedBuiltAreaSqm: planning.proposed.builtAreaSqm,
        proposedFloors: (planning.proposed as { floors?: number }).floors,
        estimatedSellableArea: planning.metrics.estimatedSellableArea,
        proposedUnits: planning.proposed.units,
        existingUnits: planning.existing.units,
        zoning: planning.zoning
          ? {
              treesForConservation: planning.zoning.treesForConservation ?? 0,
              requiredBasementFloors: planning.zoning.requiredBasementFloors ?? 1,
              todReliefApplies: planning.zoning.todReliefApplies ?? false,
              dewateringRequired: planning.zoning.dewateringRequired ?? false,
              renewalPotential: (planning.zoning as { renewalPotential?: {
                track: "tama38_2" | "pinui_binui" | "rova_plan";
                trackLabel: string;
                effectiveUpliftSqmTotal: number;
                tenantShareOfUpliftPct: number;
              } }).renewalPotential ?? null,
            }
          : undefined,
        avgSalePricePerSqm: financial.avgSalePricePerSqm,
        buildCostPerSqm: financial.buildCostPerSqm,
        softCostsPct: financial.softCostsPct,
        vatPct: financial.vatPct,
        equity: financial.equity,
        loanInterestPct: financial.loanInterestPct,
        constructionMonths: financial.constructionMonths,
        tenantRentPerMonth: financial.tenantRentPerMonth,
        tenantEvacuationCost: financial.tenantEvacuationCost,
        targetDeveloperProfitPct: financial.targetDeveloperProfitPct,
        landValuePerSqm: financial.landValuePerSqm,
        bettermentTaxPct: financial.bettermentTaxPct,
        // construction-cost refinements (optional pass-through)
        finishLevel: financial.finishLevel,
        basementCostMultiplier: financial.basementCostMultiplier,
        basementAreaPerFloorRatio: financial.basementAreaPerFloorRatio,
        demolitionCostPerSqm: financial.demolitionCostPerSqm,
        siteDevelopmentCostPerSqmPlot: financial.siteDevelopmentCostPerSqmPlot,
        escalationPctPerYear: financial.escalationPctPerYear,
        contingencyPct: financial.contingencyPct,
        constructionMode: financial.constructionMode,
        strengtheningCostPerSqm: financial.strengtheningCostPerSqm,
        ownersReturnAreaSqm: financial.ownersReturnAreaSqm,
        ownersReturnBonusPerUnitSqm: financial.ownersReturnBonusPerUnitSqm,
        minOwnerUnitSizeSqm: financial.minOwnerUnitSizeSqm,
        revenue: financial.revenue,
      };

      const report = assembleReport(engineInput);

      return new Response(JSON.stringify({ report }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DEFAULTS: AI suggestion ──
    if (mode === "defaults") {
      const parsed = DefaultsBodySchema.safeParse(body);
      if (!parsed.success) {
        return new Response(
          JSON.stringify({ error: "קלט לא תקין", details: parsed.error.flatten().fieldErrors }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { quarter, gush, helka, plotArea, proposedUnits, proposedBuiltArea } = parsed.data;

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userPrompt = `הצע ערכי ברירת מחדל פיננסיים לפרויקט הבא:
רובע ${quarter}, גוש ${gush}, חלקה ${helka}
שטח מגרש: ${plotArea} מ"ר
יח"ד מתוכננות: ${proposedUnits}
שטח בנייה כולל: ${proposedBuiltArea} מ"ר
החזר ערכים ריאליסטיים דרך הכלי suggest_financial_defaults.`;

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_DEFAULTS },
            { role: "user", content: userPrompt },
          ],
          tools: [DEFAULTS_TOOL],
          tool_choice: { type: "function", function: { name: DEFAULTS_TOOL.function.name } },
        }),
      });

      if (!aiResp.ok) {
        if (aiResp.status === 429) {
          return new Response(JSON.stringify({ error: "חרגת ממכסת בקשות — נסה שוב" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (aiResp.status === 402) {
          return new Response(JSON.stringify({ error: "אזל הקרדיט בחשבון Lovable AI" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await aiResp.text();
        console.error("AI error", aiResp.status, t);
        return new Response(JSON.stringify({ error: "AI gateway error" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiJson = await aiResp.json();
      const args = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) {
        console.error("no tool call", JSON.stringify(aiJson));
        return new Response(JSON.stringify({ error: "AI did not return structured response" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ defaults: JSON.parse(args) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "invalid mode" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("financial-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
