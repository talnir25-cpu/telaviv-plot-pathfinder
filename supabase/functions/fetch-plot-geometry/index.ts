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

// Shoelace formula — שטח פוליגון סגור בקואורדינטות מטריות (ITM/wkid 2039)
function polygonArea(ring: number[][]): number {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area / 2);
}


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
    let floorsCount: number | null = null;
    let unitsCount: number | null = null;
    try {
      const YEAR_KEY = /^(year[_\s]?built|bldg[_\s]?year|shnat[_\s]?bniya|shnat_bniya|shnath|year|taarich|build[_\s]?year|construction[_\s]?year|שנת|שנה)$/i;
      const FLOORS_KEY = /^(floors[_\s]?num|floor[_\s]?count|num[_\s]?floors|num_floors|komot|koma|floor|floors|mספר_קומות|kомот|FLOOR_NO|FLOORNUM|NUMFLOORS|FLOORSABOVE|floors_above|above_floors|stories)$/i;
      const UNITS_KEY = /^(units[_\s]?num|unit[_\s]?count|num[_\s]?units|dwelling[_\s]?units|dirot|dira|apartments|num_units|yihadot|yechidot|UNITCOUNT|NUMUNITS|DWELLINGS|residential[_\s]?units)$/i;

      const tryBuilding = async (tol: number) => {
        const bRes = await fetch("https://ags.govmap.gov.il/Identify/IdentifyByXY", {
          method: "POST",
          headers: GOVMAP_HEADERS,
          body: JSON.stringify({
            x, y, mapTolerance: tol, IsPersonalSite: false,
            layers: [{ LayerType: 0, LayerName: "BLDG_FLOOR_USAGE" }],
          }),
        });
        if (!bRes.ok) return null;
        const bJson = JSON.parse(await bRes.text());
        console.log("BLDG_RAW", JSON.stringify(bJson).substring(0, 1000));
        const years: number[] = [];
        const floorsArr: number[] = [];
        const unitsArr: number[] = [];
        const allNumbers: number[] = [];
        const walk = (node: unknown) => {
          if (!node) return;
          if (Array.isArray(node)) { for (const it of node) walk(it); return; }
          if (typeof node !== "object") return;
          for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            const n = typeof v === "number" ? v : Number(v);
            if (YEAR_KEY.test(k)) {
              if (Number.isFinite(n) && n >= 1900 && n <= 2024) years.push(n);
            } else if (FLOORS_KEY.test(k)) {
              if (Number.isFinite(n) && n >= 1 && n <= 50) floorsArr.push(n);
            } else if (UNITS_KEY.test(k)) {
              if (Number.isFinite(n) && n >= 1 && n <= 500) unitsArr.push(n);
            } else if (v && (typeof v === "object" || Array.isArray(v))) {
              walk(v);
            } else if (typeof v === "number" && Number.isFinite(v)) {
              allNumbers.push(v);
            }
          }
        };
        walk(bJson);
        let y2: number | null = years.length > 0 ? Math.min(...years) : null;
        let f2: number | null = floorsArr.length > 0 ? Math.max(...floorsArr) : null;
        let u2: number | null = unitsArr.length > 0 ? unitsArr.reduce((a, b) => a + b, 0) : null;
        if (y2 === null) {
          const cands = allNumbers.filter((n) => Number.isInteger(n) && n >= 1920 && n <= 2010);
          if (cands.length > 0) y2 = Math.min(...cands);
        }
        if (f2 === null) {
          const cands = allNumbers.filter((n) => Number.isInteger(n) && n >= 2 && n <= 20);
          if (cands.length > 0) f2 = Math.max(...cands);
        }
        if (u2 === null) {
          const cands = allNumbers.filter((n) => Number.isInteger(n) && n >= 2 && n <= 200);
          if (cands.length > 0) u2 = Math.max(...cands);
        }
        return { yearBuilt: y2, floorsCount: f2, unitsCount: u2 };
      };

      // Try a tight tolerance first, then widen if nothing was found.
      for (const tol of [15, 30]) {
        const r = await tryBuilding(tol);
        if (r && (r.yearBuilt !== null || r.floorsCount !== null || r.unitsCount !== null)) {
          yearBuilt = r.yearBuilt;
          floorsCount = r.floorsCount;
          unitsCount = r.unitsCount;
          break;
        }
      }
    } catch (_) { /* keep nulls */ }

    // Step 4 (best-effort): fetch year built from Israel Tax Authority nadlan API.
    // Runs only when Step 3 didn't return yearBuilt. Failures are silent.
    if (yearBuilt === null) {
      try {
        const nRes = await fetch(
          `https://api.nadlan.gov.il/api/v1/apartment?gush=${g}&helka=${h}`,
          { headers: { "Accept": "application/json", "User-Agent": GOVMAP_HEADERS["User-Agent"] } },
        );
        if (nRes.ok) {
          const nJson = JSON.parse(await nRes.text());
          console.log("NADLAN_RAW", JSON.stringify(nJson).substring(0, 1000));
          const YEAR_KEY_NADLAN = /^(yearBuilt|year_built|shnat_bniya|buildYear)$/i;
          const found: number[] = [];
          const walk = (node: unknown) => {
            if (!node) return;
            if (Array.isArray(node)) { for (const it of node) walk(it); return; }
            if (typeof node !== "object") return;
            for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
              if (YEAR_KEY_NADLAN.test(k)) {
                const n = typeof v === "number" ? v : Number(v);
                if (Number.isFinite(n) && n >= 1900 && n <= 2024) found.push(n);
              } else if (v && (typeof v === "object" || Array.isArray(v))) {
                walk(v);
              }
            }
          };
          walk(nJson);
          if (found.length > 0) yearBuilt = Math.min(...found);
        }
      } catch (_) { /* keep null */ }
    }

    console.log("BLDG_DEBUG", JSON.stringify({ yearBuilt, floorsCount, unitsCount }));

    // ── TLV GIS (עיריית תל אביב) — מקור עדיפות עליונה לתכסית/קומות/שנת בנייה ──
    // Layer 524 = חלקות, Layer 513 = מבנים. שניהם ב-ITM (wkid 2039).
    let buildingFootprint = 0;
    let coverageExact: number | null = null;
    let coverageReliable = false;
    let floorsFromGis: number | null = null;
    let yearFromGis: number | null = null;
    let buildingHeight: number | null = null;
    let coverageStatus = "אין מבנה ב-GIS — נדרש קלט ידני או נסח טאבו";
    try {
      console.log("TLV_GIS_START", JSON.stringify({ gush: g, helka: h }));
      const parcelUrl =
        `https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/524/query` +
        `?where=ms_gush=${g}+AND+ms_chelka=${h}` +
        `&outFields=ms_shetach_rashum,Shape_Area&returnGeometry=true&outSR=2039&f=json`;
      const parcelData = await (await fetch(parcelUrl)).json();
      const parcelFeature = parcelData?.features?.[0];
      const officialArea = Number(parcelFeature?.attributes?.ms_shetach_rashum) || 0;
      const shapeArea = Number(parcelFeature?.attributes?.Shape_Area) || 0;
      const plotAreaForCoverage = officialArea > 0 ? officialArea : shapeArea;
      console.log("TLV_GIS_PARCEL", JSON.stringify({ found: !!parcelFeature, officialArea, shapeArea }));

      if (parcelFeature?.geometry?.rings) {
        const geomParam = encodeURIComponent(JSON.stringify({
          rings: parcelFeature.geometry.rings,
          spatialReference: { wkid: 2039 },
        }));
        const bldgUrl =
          `https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/513/query` +
          `?geometry=${geomParam}&geometryType=esriGeometryPolygon` +
          `&inSR=2039&spatialRel=esriSpatialRelIntersects` +
          `&outFields=ms_komot,max_height,year&returnGeometry=true&outSR=2039&f=json`;
        const bldgData = await (await fetch(bldgUrl)).json();
        const buildings = bldgData?.features ?? [];
        for (const b of buildings) {
          const ring = b?.geometry?.rings?.[0];
          if (ring) buildingFootprint += polygonArea(ring);
        }
        const komot = buildings
          .map((b: { attributes?: { ms_komot?: number } }) => b.attributes?.ms_komot)
          .filter((n: unknown): n is number => typeof n === "number" && n > 0);
        const years = buildings
          .map((b: { attributes?: { year?: number } }) => b.attributes?.year)
          .filter((n: unknown): n is number => typeof n === "number" && n > 1900);
        const heights = buildings
          .map((b: { attributes?: { max_height?: number } }) => b.attributes?.max_height)
          .filter((n: unknown): n is number => typeof n === "number" && n > 0);
        if (komot.length) floorsFromGis = Math.max(...komot);
        if (years.length) yearFromGis = Math.min(...years);
        if (heights.length) buildingHeight = Math.max(...heights);
      }

      if (plotAreaForCoverage > 0 && buildingFootprint > 0) {
        const rawCoverage = Math.round((buildingFootprint / plotAreaForCoverage) * 1000) / 10;
        // בדיקת היגיון: תכסית >95% בדרך כלל מצביעה על היסט שתפס מבנה שכן
        if (rawCoverage <= 95) {
          coverageExact = rawCoverage;
          coverageReliable = true;
          coverageStatus = "מדויק — מקור: GIS עיריית תל אביב";
        } else {
          coverageStatus = "לא אמין (חריגה בנתוני GIS) — נדרש אימות ידני";
        }
      }

      // אם ה-GIS העירוני מספק נתונים אמינים — קדם אותם על פני GovMap
      if (coverageReliable) {
        if (floorsFromGis !== null) floorsCount = floorsFromGis;
        if (yearFromGis !== null) yearBuilt = yearFromGis;
      }
    } catch (e) {
      console.warn("TLV_GIS_FAILED", String(e));
      coverageStatus = "נתוני GIS עירוני לא זמינים — נדרש אימות ידני";
    }

    console.log("TLV_GIS", JSON.stringify({
      buildingFootprint, coverageExact, coverageReliable,
      floorsFromGis, yearFromGis, buildingHeight,
    }));

    return json({
      width, depth, yearBuilt, floorsCount, unitsCount,
      centroidX: x, centroidY: y, extent: ext,
      // ── שדות GIS עירוני ──
      buildingFootprint: Math.round(buildingFootprint * 10) / 10,
      coverageExact,
      coverageReliable,
      floorsFromGis: coverageReliable ? floorsFromGis : null,
      yearFromGis: coverageReliable ? yearFromGis : null,
      buildingHeight: coverageReliable ? buildingHeight : null,
      coverageStatus,
      source: "govmap+tlv_gis",
    });

  } catch (err) {
    return fallback("UNEXPECTED", { detail: err instanceof Error ? err.message : "unknown" });
  }
});
