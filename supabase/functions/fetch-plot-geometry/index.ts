// Fetch parcel geometry from GovMap (via the public ags.govmap.gov.il
// endpoints used in geocode-address — the api.govmap.gov.il endpoint is
// gated and returns 403). Returns bbox width/depth in meters (ITM is metric).
//
// IMPORTANT: this function ALWAYS responds with HTTP 200. Upstream failures
// (GovMap 403/502, network errors, missing data) are returned as
// `{ fallback: true, error: "..." }` so the client can show a clear status
// and fall back to manual entry without triggering generic 5xx error UI.
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fallback = (error: string, extra: Record<string, unknown> = {}) =>
  json({ fallback: true, error, ...extra }, 200);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { gush, helka } = await req.json();
    const g = Number(gush);
    const h = Number(helka);
    if (!g || !h) return json({ error: "gush/helka required" }, 400);

    // Step 1: FreeSearch by "גוש X חלקה Y" → ITM X/Y of the parcel centroid.
    let searchRes: Response;
    try {
      searchRes = await fetch("https://ags.govmap.gov.il/Search/FreeSearch", {
        method: "POST",
        headers: GOVMAP_HEADERS,
        body: JSON.stringify({ keyword: `גוש ${g} חלקה ${h}`, LstResult: null }),
      });
    } catch (e) {
      return fallback("GOVMAP_UNREACHABLE", { detail: String(e) });
    }
    if (!searchRes.ok) return fallback("GOVMAP_UNAVAILABLE", { status: searchRes.status });
    const searchText = await searchRes.text();
    let searchJson: { data?: { Result?: Array<Record<string, unknown>> } };
    try { searchJson = JSON.parse(searchText); } catch {
      return fallback("GOVMAP_BAD_RESPONSE");
    }
    const results = searchJson?.data?.Result ?? [];
    const parcelHit = results.find((r) =>
      String(r.DescLayerID ?? "").toUpperCase().startsWith("PARCEL")
    ) ?? results[0];
    if (!parcelHit) return fallback("PARCEL_NOT_FOUND");
    const x = Number(parcelHit.X);
    const y = Number(parcelHit.Y);
    if (!x || !y) return fallback("PARCEL_NO_COORDS");

    // Step 2: IdentifyByXY — response includes extent (xmin/xmax/ymin/ymax).
    let idRes: Response;
    try {
      idRes = await fetch("https://ags.govmap.gov.il/Identify/IdentifyByXY", {
        method: "POST",
        headers: GOVMAP_HEADERS,
        body: JSON.stringify({
          x, y, mapTolerance: 2, IsPersonalSite: false,
          layers: [{ LayerType: 0, LayerName: "PARCEL_ALL" }],
        }),
      });
    } catch (e) {
      return fallback("GOVMAP_UNREACHABLE", { detail: String(e) });
    }
    if (!idRes.ok) return fallback("GOVMAP_UNAVAILABLE", { status: idRes.status });
    const qText = await idRes.text();
    let qJson: unknown;
    try { qJson = JSON.parse(qText); } catch {
      return fallback("GOVMAP_BAD_RESPONSE");
    }

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
    if (!ext) return fallback("NO_EXTENT");

    const width = Math.round((ext.xmax - ext.xmin) * 10) / 10;
    const depth = Math.round((ext.ymax - ext.ymin) * 10) / 10;
    if (!(width > 0) || !(depth > 0)) return fallback("BAD_EXTENT");

    // Step 3 (best-effort): IdentifyByXY on BLDG_FLOOR_USAGE to extract year built.
    // Failures here MUST NOT fail the whole function — width/depth remain useful.
    let yearBuilt: number | null = null;
    try {
      const bRes = await fetch("https://ags.govmap.gov.il/Identify/IdentifyByXY", {
        method: "POST",
        headers: GOVMAP_HEADERS,
        body: JSON.stringify({
          x, y, mapTolerance: 2, IsPersonalSite: false,
          layers: [{ LayerType: 0, LayerName: "BLDG_FLOOR_USAGE" }],
        }),
      });
      if (bRes.ok) {
        const bJson = JSON.parse(await bRes.text());
        const YEAR_KEY = /^(year[_\s]?built|bldg[_\s]?year)$/i;
        const found: number[] = [];
        const walk = (node: unknown) => {
          if (!node) return;
          if (Array.isArray(node)) { for (const it of node) walk(it); return; }
          if (typeof node !== "object") return;
          for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (YEAR_KEY.test(k)) {
              const n = typeof v === "number" ? v : Number(v);
              if (Number.isFinite(n) && n >= 1900 && n <= 2024) found.push(n);
            } else if (v && (typeof v === "object" || Array.isArray(v))) {
              walk(v);
            }
          }
        };
        walk(bJson);
        if (found.length > 0) yearBuilt = Math.min(...found);
      }
    } catch (_) { /* keep yearBuilt null */ }

    return json({ width, depth, yearBuilt, centroidX: x, centroidY: y, extent: ext, source: "govmap" });
  } catch (err) {
    return fallback("UNEXPECTED", { detail: err instanceof Error ? err.message : "unknown" });
  }
});
