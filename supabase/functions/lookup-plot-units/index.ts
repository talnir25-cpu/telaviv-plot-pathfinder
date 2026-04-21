// Lookup existing units for a plot:
// 1. Check cache (plot_units_cache table)
// 2. If miss → query GovMap BLDG layer for buildings on the plot
// 3. Estimate units from total floor area / 80 sqm per unit
// 4. Cache the result
// Also supports POST with manual override to update the cache.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GOVMAP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://www.govmap.gov.il",
  Referer: "https://www.govmap.gov.il/",
};

const AVG_UNIT_AREA = 80; // sqm per dwelling, heuristic

interface BuildingInfo {
  floors: number | null;
  area: number | null; // footprint area sqm
}

// Try GovMap to find buildings within a parcel.
// Strategy: identify the parcel centroid (we don't have it), so caller passes x/y if available.
// Fallback: query Identify on PARCEL_ALL with gush/helka via attribute query is not exposed → we use GetParcelInfo.
async function fetchBuildingsForParcel(
  gush: number,
  helka: number,
): Promise<{ buildings: BuildingInfo[]; centroid?: { x: number; y: number } }> {
  // Step A: get parcel polygon centroid via GetParcelData
  let centroid: { x: number; y: number } | undefined;
  try {
    const r = await fetch("https://ags.govmap.gov.il/Common/GetParcelData", {
      method: "POST",
      headers: GOVMAP_HEADERS,
      body: JSON.stringify({ gush, helka }),
    });
    if (r.ok) {
      const j = await r.json();
      const data = j?.data ?? j;
      const x = Number(data?.X ?? data?.x ?? data?.centerX);
      const y = Number(data?.Y ?? data?.y ?? data?.centerY);
      if (x && y) centroid = { x, y };
    }
  } catch (e) {
    console.log("GetParcelData failed, will skip", e);
  }

  if (!centroid) return { buildings: [] };

  // Step B: Identify BLDG layer at the parcel centroid
  const layerNames = ["BUILDINGS", "BLDG", "BUILDING_ALL"];
  const buildings: BuildingInfo[] = [];

  for (const layerName of layerNames) {
    try {
      const idRes = await fetch("https://ags.govmap.gov.il/Identify/IdentifyByXY", {
        method: "POST",
        headers: GOVMAP_HEADERS,
        body: JSON.stringify({
          x: centroid.x,
          y: centroid.y,
          mapTolerance: 30,
          IsPersonalSite: false,
          layers: [{ LayerType: 0, LayerName: layerName }],
        }),
      });
      if (!idRes.ok) continue;
      const j = await idRes.json();
      const dataArr = j?.data ?? [];
      for (const layer of dataArr) {
        const results = (layer as { Result?: unknown[] }).Result ?? [];
        for (const r of results) {
          const rr = r as Record<string, unknown>;
          const fields: Array<Record<string, unknown>> = [];
          const tabs = (rr.tabs as Array<Record<string, unknown>>) ?? [];
          for (const t of tabs) {
            if (Array.isArray(t.fields)) {
              for (const f of t.fields) fields.push(f as Record<string, unknown>);
            }
          }
          if (Array.isArray(rr.fields)) {
            for (const f of rr.fields) fields.push(f as Record<string, unknown>);
          }
          let floors: number | null = null;
          let area: number | null = null;
          for (const f of fields) {
            const name = String(f.FieldName ?? f.fieldName ?? "").trim();
            const value = String(f.FieldValue ?? f.fieldValue ?? "").trim();
            if (!value) continue;
            // Common GovMap building field names (Hebrew + English variants)
            if (/קומות|FLOORS|NUM_FLOORS|FloorsNum/i.test(name)) {
              const n = Number(value);
              if (!isNaN(n) && n > 0) floors = n;
            } else if (/שטח|AREA|BLDG_AREA|SHAPE_Area/i.test(name)) {
              const n = Number(value);
              if (!isNaN(n) && n > 10) area = n;
            }
          }
          if (floors !== null || area !== null) {
            buildings.push({ floors, area });
          }
        }
      }
      if (buildings.length > 0) break; // first layer that returned data wins
    } catch (e) {
      console.log(`Identify ${layerName} failed`, e);
    }
  }

  return { buildings, centroid };
}

function estimateUnits(
  buildings: BuildingInfo[],
  plotArea: number | null,
): { units: number; floors: number; totalFloorArea: number } {
  if (buildings.length === 0) {
    // Fallback: assume 3 floors × 60% coverage of plot
    const floors = 3;
    const footprint = plotArea ? plotArea * 0.4 : 200;
    const totalFloorArea = footprint * floors;
    return {
      units: Math.max(1, Math.round(totalFloorArea / AVG_UNIT_AREA)),
      floors,
      totalFloorArea,
    };
  }
  let totalFloorArea = 0;
  let maxFloors = 0;
  for (const b of buildings) {
    const floors = b.floors ?? 3;
    const footprint = b.area ?? (plotArea ? plotArea * 0.4 : 150);
    totalFloorArea += footprint * floors;
    if (floors > maxFloors) maxFloors = floors;
  }
  return {
    units: Math.max(1, Math.round(totalFloorArea / AVG_UNIT_AREA)),
    floors: maxFloors || 3,
    totalFloorArea,
  };
}

interface RequestBody {
  gush: number;
  helka: number;
  plotArea?: number | null;
  // optional manual override to save into cache
  manualUnits?: number;
  manualFloors?: number;
  manualNotes?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;
    if (!body?.gush || !body?.helka) {
      return new Response(JSON.stringify({ error: "missing gush/helka" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // If manual override provided → upsert and return.
    if (typeof body.manualUnits === "number" && body.manualUnits > 0) {
      const payload = {
        gush: body.gush,
        helka: body.helka,
        existing_units: body.manualUnits,
        existing_floors: body.manualFloors ?? null,
        source: "manual",
        notes: body.manualNotes ?? null,
      };
      const { error } = await supabase
        .from("plot_units_cache")
        .upsert(payload, { onConflict: "gush,helka" });
      if (error) {
        console.error("upsert manual failed", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          units: body.manualUnits,
          floors: body.manualFloors ?? null,
          source: "manual",
          cached: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Check cache
    const { data: cached } = await supabase
      .from("plot_units_cache")
      .select("existing_units, existing_floors, source, building_count, total_floor_area, notes")
      .eq("gush", body.gush)
      .eq("helka", body.helka)
      .maybeSingle();

    if (cached) {
      return new Response(
        JSON.stringify({
          units: cached.existing_units,
          floors: cached.existing_floors,
          source: cached.source,
          buildingCount: cached.building_count,
          totalFloorArea: cached.total_floor_area,
          notes: cached.notes,
          cached: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Query GovMap for buildings
    const { buildings } = await fetchBuildingsForParcel(body.gush, body.helka);
    const estimate = estimateUnits(buildings, body.plotArea ?? null);
    const source = buildings.length > 0 ? "govmap_bldg" : "estimate";

    // 3. Cache it
    const { error: insertErr } = await supabase
      .from("plot_units_cache")
      .upsert(
        {
          gush: body.gush,
          helka: body.helka,
          existing_units: estimate.units,
          existing_floors: estimate.floors,
          source,
          building_count: buildings.length,
          total_floor_area: estimate.totalFloorArea,
        },
        { onConflict: "gush,helka" },
      );
    if (insertErr) console.error("cache upsert failed", insertErr);

    return new Response(
      JSON.stringify({
        units: estimate.units,
        floors: estimate.floors,
        source,
        buildingCount: buildings.length,
        totalFloorArea: estimate.totalFloorArea,
        cached: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("lookup-plot-units error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
