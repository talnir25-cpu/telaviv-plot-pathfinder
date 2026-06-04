// Auto-check conservation / UNESCO status for a Tel Aviv plot — authoritative
// version, backed by the official Tel Aviv ArcGIS feature layer 682
// "מבנים ואתרים לשימור".
//
// Sources in priority order:
//   1) ArcGIS spatial query (point-in-polygon) — when centroid is provided.
//   2) ArcGIS attribute search — by gush/helka mention in the `ktovot` field.
//   3) UNESCO "White City" buffer polygon (local fallback).
//
// The function never throws to the caller: on total failure it returns
// confidence="unknown" so the UI can show a soft state without blocking
// the analysis flow.

import { UNESCO_BUFFER_ITM, pointInPolygon } from "../_shared/unesco-buffer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tel Aviv GIS — "מבנים ואתרים לשימור" (Layer 682)
const TLV_ARCGIS_QUERY =
  "https://gisn.tel-aviv.gov.il/arcgis/rest/services/WM/IView2WM/MapServer/682/query";
const TLV_ARCGIS_LAYER_URL =
  "https://gisn.tel-aviv.gov.il/arcgis/rest/services/WM/IView2WM/MapServer/682";

const OUT_FIELDS = [
  "oid",
  "shem_mivne",
  "t_hatraa",
  "st_taba",
  "ktovot",
  "hagbalot",
  "atraa_warn",
  "tr_hatraot",
].join(",");

interface ArcgisFeature {
  attributes: {
    oid?: number;
    shem_mivne?: string | null;
    t_hatraa?: string | null;
    st_taba?: string | null;
    ktovot?: string | null;
    hagbalot?: number | null;
    atraa_warn?: string | null;
    tr_hatraot?: string | null;
  };
}

interface ArcgisQueryResponse {
  features?: ArcgisFeature[];
  error?: { code: number; message: string };
}

async function fetchWithTimeout(url: string, ms = 6000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function arcgisQuery(
  params: Record<string, string>,
): Promise<{ features: ArcgisFeature[]; error?: string }> {
  const qs = new URLSearchParams({
    f: "json",
    outFields: OUT_FIELDS,
    returnGeometry: "false",
    ...params,
  });
  try {
    const res = await fetchWithTimeout(`${TLV_ARCGIS_QUERY}?${qs}`, 6000);
    if (!res.ok) return { features: [], error: `HTTP ${res.status}` };
    const json = (await res.json().catch(() => null)) as
      | ArcgisQueryResponse
      | null;
    if (!json) return { features: [], error: "invalid json" };
    if (json.error) return { features: [], error: json.error.message };
    return { features: json.features ?? [] };
  } catch (e) {
    return {
      features: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function spatialQuery(
  centroidX: number,
  centroidY: number,
): Promise<{ features: ArcgisFeature[]; error?: string }> {
  const geometry = JSON.stringify({
    x: centroidX,
    y: centroidY,
    spatialReference: { wkid: 2039 },
  });
  return arcgisQuery({
    geometry,
    geometryType: "esriGeometryPoint",
    inSR: "2039",
    spatialRel: "esriSpatialRelIntersects",
  });
}

async function attributeQuery(
  gush: number,
  helka: number,
): Promise<{ features: ArcgisFeature[]; error?: string }> {
  // The `ktovot` field is a free-text concatenation of addresses; some records
  // also include gush/helka identifiers. We try a couple of common spellings.
  const where = `ktovot LIKE '%${gush}%' AND ktovot LIKE '%${helka}%'`;
  return arcgisQuery({ where });
}

// Map TLV's `t_hatraa` text + `hagbalot` flag to a normalized level.
function deriveLevel(
  tHatraa: string | null | undefined,
  hagbalot: number | null | undefined,
): "מחמיר" | "רגיל" | null {
  const strict = hagbalot === 1;
  const text = (tHatraa ?? "").trim();
  if (strict || /מחמיר/.test(text)) return "מחמיר";
  if (text) return "רגיל";
  return null;
}

function buildMapLink(oid: number | undefined): string {
  // Public IView2 viewer — opening the page is enough; OID query is decorative
  // for traceability in logs.
  if (!oid) return TLV_ARCGIS_LAYER_URL;
  return `${TLV_ARCGIS_LAYER_URL}/${oid}?f=html`;
}

function summarizeFeature(f: ArcgisFeature) {
  const a = f.attributes;
  const addresses = (a.ktovot ?? "")
    .split(/[;,|]/)
    .map((s) => s.trim())
    .filter((s) => s && s.length < 200);
  return {
    buildingName: a.shem_mivne ?? null,
    description: a.t_hatraa ?? null,
    planRef: a.st_taba ?? null,
    addresses,
    strictRestrictions: a.hagbalot === 1,
    warning: a.atraa_warn ?? null,
    alertDates: a.tr_hatraot ?? null,
    level: deriveLevel(a.t_hatraa, a.hagbalot),
    mapLink: buildMapLink(a.oid),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const gush = Number(body?.gush);
    const helka = Number(body?.helka);
    const centroidX =
      typeof body?.centroidX === "number" ? body.centroidX : null;
    const centroidY =
      typeof body?.centroidY === "number" ? body.centroidY : null;

    if (!Number.isFinite(gush) || !Number.isFinite(helka)) {
      return new Response(
        JSON.stringify({ error: "gush and helka are required numbers" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // UNESCO buffer check — deterministic, runs first as a hint and as a
    // graceful fallback for when ArcGIS is unreachable.
    const inUnescoBuffer =
      centroidX != null && centroidY != null
        ? pointInPolygon([centroidX, centroidY], UNESCO_BUFFER_ITM)
        : false;

    // Try the authoritative ArcGIS source.
    let arc = { features: [] as ArcgisFeature[], error: undefined as string | undefined };
    if (centroidX != null && centroidY != null) {
      arc = await spatialQuery(centroidX, centroidY);
    }
    // Fallback: attribute search if spatial failed or wasn't possible.
    if (arc.features.length === 0 && (!arc.error || centroidX == null)) {
      const attr = await attributeQuery(gush, helka);
      if (attr.features.length > 0) arc = attr;
      else if (attr.error && !arc.error) arc.error = attr.error;
    }

    if (arc.features.length > 0) {
      const details = summarizeFeature(arc.features[0]);
      const allMatches = arc.features.map(summarizeFeature);
      return new Response(
        JSON.stringify({
          isConservation: true,
          level: details.level,
          buildingName: details.buildingName,
          planRef: details.planRef ?? "תא/2650/ב",
          addresses: details.addresses,
          strictRestrictions: details.strictRestrictions,
          warning: details.warning,
          description: details.description,
          inUnescoBuffer,
          source: "tlv_arcgis_682",
          confidence: "high",
          mapLink: details.mapLink,
          matchesCount: arc.features.length,
          allMatches: allMatches.length > 1 ? allMatches : undefined,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // No ArcGIS match — decide between high-confidence "no" vs UNESCO fallback.
    if (arc.error) {
      // Authoritative source unreachable; lean on UNESCO buffer if available.
      if (inUnscopedBufferCheck(inUnescoBuffer)) {
        return new Response(
          JSON.stringify({
            isConservation: true,
            level: null,
            buildingName: null,
            planRef: "תא/2650/ב",
            addresses: [],
            strictRestrictions: false,
            inUnescoBuffer: true,
            source: "unesco_buffer",
            confidence: "medium",
            reason:
              "החלקה בתוך מתחם ההכרזה של UNESCO (העיר הלבנה); מקור GIS עיריית ת״א לא זמין כרגע — נדרש בירור פרטני",
            arcgisError: arc.error,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      return new Response(
        JSON.stringify({
          isConservation: false,
          level: null,
          inUnescoBuffer,
          source: "unknown",
          confidence: "unknown",
          reason: `מקור GIS עיריית ת״א לא זמין כרגע (${arc.error})`,
          arcgisError: arc.error,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ArcGIS responded with zero matches → authoritative "not conserved".
    return new Response(
      JSON.stringify({
        isConservation: false,
        level: null,
        inUnescoBuffer,
        source: "tlv_arcgis_682",
        confidence: centroidX != null ? "high" : "medium",
        reason: inUnescoBuffer
          ? "המבנה אינו ברשימת בניינים לשימור, אך החלקה בתוך מתחם UNESCO — מומלץ אימות פרטני"
          : "המבנה אינו מופיע ברשימת המבנים והאתרים לשימור של עיריית ת״א",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("lookup-conservation-status error", e);
    return new Response(
      JSON.stringify({
        isConservation: false,
        level: null,
        inUnescoBuffer: false,
        source: "error",
        confidence: "unknown",
        reason: e instanceof Error ? e.message : "unexpected error",
      }),
      {
        status: 200, // never break the caller's flow
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

// Trivial helper — kept as a function so the intent is explicit at call site.
function inUnscopedBufferCheck(v: boolean): boolean {
  return v === true;
}
