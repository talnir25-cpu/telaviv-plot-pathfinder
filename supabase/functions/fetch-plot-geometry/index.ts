// Fetch parcel geometry from GovMap and return bounding-box dimensions
// (width = ΔX, depth = ΔY) in meters — ITM (EPSG:2039) is metric.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOVMAP_HEADERS = {
  "Accept": "application/json",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Origin": "https://www.govmap.gov.il",
  "Referer": "https://www.govmap.gov.il/",
};

// Walk an arbitrary nested structure looking for coordinate pairs and
// accumulate the bounding box. GovMap responses vary in shape — sometimes
// `geometry.rings`, sometimes `geometry.coordinates`, sometimes nested under
// `features`. A defensive walk handles them all.
function collectBbox(node: unknown, bbox: { minX: number; maxX: number; minY: number; maxY: number }) {
  if (!node) return;
  if (Array.isArray(node)) {
    // Coordinate pair: [x, y] where both are large numbers (ITM ~ 100k-250k)
    if (
      node.length >= 2 &&
      typeof node[0] === "number" &&
      typeof node[1] === "number" &&
      node[0] > 1000 &&
      node[1] > 1000
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
    const { gush, helka } = await req.json();
    const g = Number(gush);
    const h = Number(helka);
    if (!g || !h) {
      return new Response(JSON.stringify({ error: "gush/helka required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const url = `https://api.govmap.gov.il/QueryGeometry/QueryByGushHelka?gush=${g}&helka=${h}&type=1`;
    const res = await fetch(url, { headers: GOVMAP_HEADERS });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `GovMap ${res.status}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return new Response(JSON.stringify({ error: "invalid GovMap payload" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bbox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    collectBbox(json, bbox);
    if (!Number.isFinite(bbox.minX) || !Number.isFinite(bbox.minY)) {
      return new Response(JSON.stringify({ error: "no geometry found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const width = Math.round((bbox.maxX - bbox.minX) * 10) / 10;
    const depth = Math.round((bbox.maxY - bbox.minY) * 10) / 10;
    return new Response(
      JSON.stringify({ width, depth, bbox, source: "govmap" }),
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
