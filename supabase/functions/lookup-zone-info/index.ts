// Lookup zoning rights for a Tel Aviv plot, deterministically from the
// `zoning_rights` table seeded from תקנון רבע 3 / רבע 4.
//
// Inputs (POST JSON):
//   { quarter: 3|4, gush: number, helka: number,
//     street?: string,                // shem ha-rechov (לדוגמה: "ויצמן")
//     zone_label_override?: string,   // optional manual override
//     area_hint?: "declaration"|"market_street"|"rest" }
//
// Output:
//   { plan_code, zone_label, rights: { ... }, source_citation,
//     confidence: "high"|"medium"|"low",
//     match_reason: string,
//     available_zones: string[] }

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

const DEFAULT_ZONE_BY_QUARTER: Record<number, string> = {
  3: "מגורים ג",
  4: "ברירת מחדל רובע 4",
};

// ניקוי שם רחוב — הסרת תחיליות וסיומות סטנדרטיות
function normalizeStreet(s: string): string {
  if (!s) return "";
  let out = s.trim();
  // הסרת תחיליות "רח'", "רחוב", "שד'", "שדרות", "דרך"
  out = out.replace(/^(רח'?|רחוב|שד'?|שדרות|דרך)\s+/u, "");
  // אם הסיומת היא מספר בית — להוריד
  out = out.replace(/\s+\d+\s*(,.*)?$/u, "");
  // הסרת פסיק וכל מה שאחריו (לדוגמה ", תל אביב")
  out = out.split(",")[0]?.trim() ?? out;
  return out.trim();
}

function streetMatches(input: string, candidates: string[]): boolean {
  const a = normalizeStreet(input);
  if (!a) return false;
  for (const c of candidates) {
    const b = normalizeStreet(c);
    if (!b) continue;
    if (a === b) return true;
    // התאמה רופפת: אחד הוא חלק של השני (תופס "ז'בוטינסקי"/"זבוטינסקי")
    const aClean = a.replace(/['"׳״]/g, "");
    const bClean = b.replace(/['"׳״]/g, "");
    if (aClean === bClean) return true;
    if (aClean.includes(bClean) || bClean.includes(aClean)) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const quarter = Number(body?.quarter);
    const street: string | undefined = body?.street;
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
    const defaultZone = DEFAULT_ZONE_BY_QUARTER[quarter];

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

    let chosen: any = null;
    let confidence: "high" | "medium" | "low" = "low";
    let matchReason = "";

    // ── עדיפות 1: דריסה ידנית של ייעוד ──
    if (zoneOverride) {
      chosen = (zones ?? []).find((z) => z.zone_label === zoneOverride);
      if (chosen) {
        confidence = "high";
        matchReason = `נבחר ידנית: ${zoneOverride}`;
      }
    }

    // ── עדיפות 2: התאמה לפי שם רחוב (location_filter.streets) ──
    if (!chosen && street) {
      for (const z of zones ?? []) {
        const f = (z.location_filter ?? {}) as Record<string, unknown>;
        const streets = Array.isArray(f.streets) ? (f.streets as string[]) : null;
        if (streets && streetMatches(street, streets)) {
          chosen = z;
          confidence = "high";
          matchReason = `התאמה לפי רחוב: ${normalizeStreet(street)} → ${z.zone_label}`;
          break;
        }
      }
    }

    // ── עדיפות 3: רמז על אזור הכרזה ──
    if (!chosen && areaHint === "declaration") {
      chosen = (zones ?? []).find((z) => {
        const f = (z.location_filter ?? {}) as Record<string, unknown>;
        return f.area === "declaration";
      });
      if (chosen) {
        confidence = "medium";
        matchReason = "סימון ידני: בתחום אזור ההכרזה אונסקו";
      }
    }

    // ── עדיפות 4: ברירת מחדל לרובע ──
    if (!chosen) {
      chosen = (zones ?? []).find((z) => z.zone_label === defaultZone);
      if (!chosen) {
        // fallback אחרון — שורה ראשונה זמינה
        chosen = (zones ?? [])[0];
      }
      if (chosen) {
        // ברובע 4 ה-default הוא ערך מבוסס תקנון, לכן medium ולא low
        confidence = quarter === 4 ? "medium" : "low";
        matchReason = street
          ? `לא נמצאה התאמת רחוב עבור "${normalizeStreet(street)}" — שימוש בברירת מחדל`
          : "לא סופק שם רחוב — שימוש בברירת מחדל לרובע";
      }
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
        match_reason: matchReason,
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
