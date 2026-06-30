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
    const centroidX: number | undefined = typeof body?.centroidX === "number" ? body.centroidX : undefined;
    const centroidY: number | undefined = typeof body?.centroidY === "number" ? body.centroidY : undefined;
    const plotArea: number | undefined =
      typeof body?.plot_area === "number" ? body.plot_area :
      typeof body?.plotArea === "number" ? body.plotArea : undefined;

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

    // ── עדיפות 2.5: התאמה לפי גודל מגרש (location_filter.min_plot_area_sqm / max_plot_area_sqm) ──
    if (!chosen && plotArea && plotArea > 0) {
      for (const z of zones ?? []) {
        const f = (z.location_filter ?? {}) as Record<string, unknown>;
        const minArea = typeof f.min_plot_area_sqm === "number" ? f.min_plot_area_sqm : null;
        const maxArea = typeof f.max_plot_area_sqm === "number" ? f.max_plot_area_sqm : null;
        if (minArea == null && maxArea == null) continue;
        const aboveMin = minArea == null || plotArea >= minArea;
        const belowMax = maxArea == null || plotArea <= maxArea;
        if (aboveMin && belowMax) {
          chosen = z;
          confidence = "medium";
          matchReason = `התאמה לפי גודל מגרש: ${plotArea} מ"ר → ${z.zone_label}`;
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

    // ── עדיפות 3.5: התאמה גיאוגרפית מ-GovMap (ZONING_TOV) ──
    if (!chosen && centroidX != null && centroidY != null) {
      try {
        const gRes = await fetch("https://ags.govmap.gov.il/Identify/IdentifyByXY", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Origin": "https://www.govmap.gov.il",
            "Referer": "https://www.govmap.gov.il/",
          },
          body: JSON.stringify({
            x: centroidX,
            y: centroidY,
            mapTolerance: 2,
            IsPersonalSite: false,
            layers: [{ LayerType: 0, LayerName: "ZONING_TOV" }],
          }),
        });
        if (gRes.ok) {
          const gJson = JSON.parse(await gRes.text());
          const ZONE_KEY = /^(zone[_\s]?desc|zone[_\s]?label|tochni[_\s]?tipul|zone[_\s]?type)$/i;
          const foundLabels: string[] = [];
          const walk = (node: unknown) => {
            if (!node) return;
            if (Array.isArray(node)) { for (const it of node) walk(it); return; }
            if (typeof node !== "object") return;
            for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
              if (ZONE_KEY.test(k) && typeof v === "string" && v.trim()) {
                foundLabels.push(v.trim());
              } else if (v && (typeof v === "object" || Array.isArray(v))) {
                walk(v);
              }
            }
          };
          walk(gJson);
          for (const lbl of foundLabels) {
            const match = (zones ?? []).find(
              (z) => String(z.zone_label).trim() === lbl ||
                     String(z.zone_label).trim().includes(lbl) ||
                     lbl.includes(String(z.zone_label).trim()),
            );
            if (match) {
              chosen = match;
              confidence = "high";
              matchReason = `התאמה גיאוגרפית מ-GovMap (${lbl}) → ${match.zone_label}`;
              break;
            }
          }
        } else {
          console.warn("ZONING_TOV non-OK", gRes.status);
        }
      } catch (e) {
        console.warn("ZONING_TOV lookup failed (non-fatal)", e);
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
          max_coverage_pct: chosen.max_coverage_pct,
          max_far: chosen.max_far,
          max_floors_above: chosen.max_floors_above,
          max_floors_roof: chosen.max_floors_roof,
          density_coefficient_sqm_per_unit: chosen.density_coefficient_sqm_per_unit,
          min_unit_size_sqm: chosen.min_unit_size_sqm,
          setback_front_m: chosen.setback_front_m,
          setback_side_m: chosen.setback_side_m,
          setback_rear_m: chosen.setback_rear_m,
          tama38_far_bonus: chosen.tama38_far_bonus,
          demolition_rebuild_far_bonus: chosen.demolition_rebuild_far_bonus,
          rova_plan_far_bonus: chosen.rova_plan_far_bonus,
          tama38_units_bonus_pct: chosen.tama38_units_bonus_pct,
          demolition_rebuild_units_bonus_pct: chosen.demolition_rebuild_units_bonus_pct,
          rights_basis: chosen.rights_basis,
          service_area_ratio_pct: chosen.service_area_ratio_pct,
          requires_manual_classification: chosen.requires_manual_classification,
          classification_note: chosen.classification_note,
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
