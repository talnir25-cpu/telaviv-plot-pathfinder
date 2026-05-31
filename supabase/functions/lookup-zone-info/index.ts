// Lookup zoning rights for a Tel Aviv plot, deterministically from the
// `zoning_rights` table seeded from תקנון רבע 3 / רבע 4.
//
// Inputs (POST JSON):
//   { quarter: 3|4, gush: number, helka: number,
//     zone_label_override?: string,   // optional manual override
//     area_hint?: "declaration"|"market_street"|"rest" }
//
// Output:
//   { plan_code, zone_label, rights: { ... }, source_citation,
//     confidence: "high"|"medium"|"low", available_zones: string[] }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PLAN_BY_QUARTER: Record<number, string> = {
  3: "תא/3616/א",
  4: "תא/3729/א",
};

const DEFAULT_ZONE = "מגורים ג"; // השכיח ביותר ברבעים 3-4

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const quarter = Number(body?.quarter);
    const zoneOverride: string | undefined = body?.zone_label_override;
    const areaHint: string | undefined = body?.area_hint;

    if (quarter !== 3 && quarter !== 4) {
      return new Response(
        JSON.stringify({ error: "quarter must be 3 or 4" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const planCode = PLAN_BY_QUARTER[quarter];

    // שליפת כל הייעודים של אותו רובע
    const { data: zones, error } = await supabase
      .from("zoning_rights")
      .select("*")
      .eq("plan_code", planCode);

    if (error) {
      console.error("zoning_rights query error", error);
      return new Response(
        JSON.stringify({ error: "DB query failed", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const available = (zones ?? []).map((z) => z.zone_label);

    // בחירת השורה הנכונה
    let chosen: any = null;
    let confidence: "high" | "medium" | "low" = "low";

    if (zoneOverride) {
      // התאמה לפי override + area_hint אם סופק
      chosen = (zones ?? []).find((z) => {
        if (z.zone_label !== zoneOverride) return false;
        if (!areaHint) return true;
        const f = (z.location_filter ?? {}) as Record<string, unknown>;
        return !f.area || f.area === areaHint;
      }) ?? (zones ?? []).find((z) => z.zone_label === zoneOverride);
      if (chosen) confidence = "high";
    }

    if (!chosen) {
      // ברירת מחדל: "מגורים ג" באזור "rest" אם קיים
      chosen = (zones ?? []).find((z) => {
        if (z.zone_label !== DEFAULT_ZONE) return false;
        const f = (z.location_filter ?? {}) as Record<string, unknown>;
        return !f.area || f.area === (areaHint ?? "rest");
      }) ?? (zones ?? []).find((z) => z.zone_label === DEFAULT_ZONE);
      if (chosen) confidence = "low"; // ברירת מחדל — דורש אימות ידני
    }

    if (!chosen) {
      return new Response(
        JSON.stringify({ error: "No zoning data for this quarter", available_zones: available }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        plan_code: chosen.plan_code,
        zone_label: chosen.zone_label,
        rights: {
          coverage_pct: chosen.coverage_pct,
          max_far: chosen.max_far,
          max_floors_above: chosen.max_floors_above,
          max_floors_roof: chosen.max_floors_roof,
          density_coefficient_sqm_per_unit: chosen.density_coefficient_sqm_per_unit,
          min_unit_size_sqm: chosen.min_unit_size_sqm,
          setback_front_m: chosen.setback_front_m,
          setback_side_m: chosen.setback_side_m,
          setback_rear_m: chosen.setback_rear_m,
          tama38_far_bonus: chosen.tama38_far_bonus,
          pinui_far_bonus: chosen.pinui_far_bonus,
          rova_plan_far_bonus: chosen.rova_plan_far_bonus,
          tama38_units_bonus_pct: chosen.tama38_units_bonus_pct,
          pinui_units_bonus_pct: chosen.pinui_units_bonus_pct,
        },
        source_citation: chosen.source_citation,
        notes: chosen.notes,
        confidence,
        available_zones: Array.from(new Set(available)),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("lookup-zone-info error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
