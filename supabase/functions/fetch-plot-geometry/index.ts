// Fetch parcel geometry from GovMap (via the public ags.govmap.gov.il
// endpoints used in geocode-address — the api.govmap.gov.il endpoint is
// gated and returns 403). Returns bbox width/depth in meters (ITM is metric).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOVMAP_HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Origin": "https://www.govmap.gov.il",
  "Referer": "https://www.govmap.gov.il/",
};

// Walk an arbitrary nested structure looking for ITM coordinate pairs
// (X ~150k-250k, Y ~600k-770k for Israel) and accumulate the bounding box.
// GovMap responses nest geometry as `geometry.rings`, `geometry.coordinates`,
// or inside `tabs[].fields[].geometry` — a defensive walk handles all shapes.
function collectBbox(node: unknown, bbox: { minX: number; maxX: number; minY: number; maxY: number }) {
  if (!node) return;
  if (Array.isArray(node)) {
    if (
      node.length >= 2 &&
      typeof node[0] === "number" &&
      typeof node[1] === "number" &&
      node[0] > 100000 && node[0] < 300000 &&
      node[1] > 500000 && node[1] < 800000
    ) {
      const x = node[0] as number;
      const y = node[1] as number;
      if (x < bbox.minX) bbox.minX = x;
      if (x > bbox.maxX) bbox.maxX = x;
      if (y < bbox.minY) bbox.minY = y;
      if (y > bbox.maxY) bbox.maxY = y;
      return;
    }
    for (const item of node) collectBbox(item, bbox);
    return;
  }
  if (typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) collectBbox(v, bbox);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { gush, helka, debug } = await req.json();
    const g = Number(gush);
    const h = Number(helka);
    if (!g || !h) {
      return new Response(JSON.stringify({ error: "gush/helka required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: FreeSearch by "גוש X חלקה Y" → ITM X/Y of the parcel centroid.
    const searchRes = await fetch("https://ags.govmap.gov.il/Search/FreeSearch", {
      method: "POST",
      headers: GOVMAP_HEADERS,
      body: JSON.stringify({ keyword: `גוש ${g} חלקה ${h}`, LstResult: null }),
    });
    const searchText = await searchRes.text();
    if (!searchRes.ok) {
      return new Response(JSON.stringify({ error: `FreeSearch ${searchRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const searchJson = JSON.parse(searchText) as {
      data?: { Result?: Array<Record<string, unknown>> };
    };
    const results = searchJson?.data?.Result ?? [];
    const parcelHit = results.find((r) =>
      String(r.DescLayerID ?? "").toUpperCase().startsWith("PARCEL")
    ) ?? results[0];
    if (!parcelHit) {
      return new Response(JSON.stringify({ error: "parcel not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const x = Number(parcelHit.X);
    const y = Number(parcelHit.Y);
    if (!x || !y) {
      return new Response(JSON.stringify({ error: "no coordinates" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: ArcGIS REST point-in-polygon query against PARCEL_ALL — returns
    // geometry rings by default. Spatial query avoids field-name guessing
    // (different layer indexes use different attribute names).
    // Step 2: IdentifyByXY — request includes geometry rings.
    const idRes = await fetch("https://ags.govmap.gov.il/Identify/IdentifyByXY", {
      method: "POST",
      headers: GOVMAP_HEADERS,
      body: JSON.stringify({
        x, y, mapTolerance: 2, IsPersonalSite: false,
        layers: [{ LayerType: 0, LayerName: "PARCEL_ALL" }],
      }),
    });
    const qText = await idRes.text();
    if (!idRes.ok) {
      return new Response(JSON.stringify({ error: `Identify ${idRes.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let qJson: unknown;
    try { qJson = JSON.parse(qText); } catch {
      return new Response(JSON.stringify({ error: "Identify non-JSON", sample: qText.slice(0, 200) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Identify response includes `extent` (xmin/xmax/ymin/ymax) on each Result
    // — use it directly. Walk the structure to find the first one.
    type Extent = { xmin: number; xmax: number; ymin: number; ymax: number };
    const findExtent = (node: unknown): Extent | null => {
      if (!node || typeof node !== "object") return null;
      const obj = node as Record<string, unknown>;
      if (
        typeof obj.xmin === "number" && typeof obj.xmax === "number" &&
        typeof obj.ymin === "number" && typeof obj.ymax === "number"
      ) return obj as unknown as Extent;
      for (const v of Object.values(obj)) {
        if (Array.isArray(v)) {
          for (const item of v) { const e = findExtent(item); if (e) return e; }
        } else if (v && typeof v === "object") {
          const e = findExtent(v); if (e) return e;
        }
      }
      return null;
    };
    const ext = findExtent(qJson);
    if (!ext) {
      return new Response(JSON.stringify({ error: "no extent in response" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const width = Math.round((ext.xmax - ext.xmin) * 10) / 10;
    const depth = Math.round((ext.ymax - ext.ymin) * 10) / 10;
    return new Response(
      JSON.stringify({ width, depth, extent: ext, source: "govmap" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
