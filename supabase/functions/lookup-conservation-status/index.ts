// Auto-check conservation / UNESCO status for a Tel Aviv plot.
//
// Sources (best-effort, never throws to caller):
//   1) Tel Aviv open-data "buildings for preservation" — searched by
//      gush+helka via CKAN datastore_search.
//   2) UNESCO "White City" buffer polygon (ITM) — point-in-polygon test
//      using the centroid provided by fetch-plot-geometry.
//
// Input  (POST JSON): { gush, helka, centroidX?, centroidY? }
// Output (200 JSON):
//   {
//     isConservation: boolean,
//     level: "א" | "ב" | null,
//     inUnescoBuffer: boolean,
//     confidence: "high" | "medium" | "low" | "unknown",
//     source: string,
//     details?: { address?: string, planRef?: string, raw?: unknown },
//     reason?: string
//   }

import { UNESCO_BUFFER_ITM, pointInPolygon } from "../_shared/unesco-buffer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Public CKAN endpoint for Tel Aviv open data.
const CKAN_BASE = "https://opendata.tel-aviv.gov.il/api/action/datastore_search";
// Resource ID for the "buildings for preservation" dataset.
// (May change; the function degrades gracefully if it returns 404.)
const PRESERVATION_RESOURCE_ID = "ed1aa07c-b6e9-4283-bb16-9b1140fe6244";

async function fetchWithTimeout(url: string, ms = 6000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

interface CkanRow {
  // Field names vary; we read defensively.
  [k: string]: unknown;
}

function pickString(row: CkanRow, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function pickLevel(row: CkanRow): "א" | "ב" | null {
  const candidates = [
    "preservation_level", "level", "רמת_שימור", "רמה",
    "preservation_grade", "grade", "סוג_שימור",
  ];
  for (const k of candidates) {
    const v = row[k];
    if (typeof v === "string") {
      if (v.includes("א") || /\bA\b/i.test(v) || v.includes("1")) return "א";
      if (v.includes("ב") || /\bB\b/i.test(v) || v.includes("2")) return "ב";
    }
  }
  return null;
}

async function lookupTlvPreservation(
  gush: number,
  helka: number,
): Promise<{
  found: boolean;
  level: "א" | "ב" | null;
  address: string | null;
  raw?: unknown;
  error?: string;
}> {
  try {
    // CKAN datastore_search supports `filters` as URL-encoded JSON.
    // Field names in the TLV preservation dataset are commonly `gush` / `helka`.
    const filters = JSON.stringify({ gush, helka });
    const url = `${CKAN_BASE}?resource_id=${PRESERVATION_RESOURCE_ID}&filters=${encodeURIComponent(filters)}&limit=5`;
    const res = await fetchWithTimeout(url, 6000);
    if (!res.ok) {
      return { found: false, level: null, address: null, error: `HTTP ${res.status}` };
    }
    const json = await res.json().catch(() => null) as
      | { success?: boolean; result?: { records?: CkanRow[] } }
      | null;
    const records = json?.result?.records ?? [];
    if (!records.length) {
      return { found: false, level: null, address: null };
    }
    const first = records[0];
    return {
      found: true,
      level: pickLevel(first),
      address: pickString(first, ["address", "street_address", "כתובת", "shem_rechov"]),
      raw: records,
    };
  } catch (e) {
    return {
      found: false,
      level: null,
      address: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1) UNESCO buffer (deterministic, works as long as centroid is available)
    let inUnescoBuffer = false;
    if (centroidX != null && centroidY != null) {
      inUnescoBuffer = pointInPolygon([centroidX, centroidY], UNESCO_BUFFER_ITM);
    }

    // 2) Tel Aviv preservation list (authoritative when available)
    const tlv = await lookupTlvPreservation(gush, helka);

    let isConservation = false;
    let level: "א" | "ב" | null = null;
    let confidence: "high" | "medium" | "low" | "unknown" = "unknown";
    let source = "";
    let reason: string | undefined;

    if (tlv.found) {
      isConservation = true;
      level = tlv.level;
      confidence = "high";
      source = "tlv_opendata";
    } else if (inUnescoBuffer) {
      // No specific listing, but inside the UNESCO buffer → likely conservation context.
      isConservation = true;
      confidence = "medium";
      source = "unesco_buffer";
      reason = "החלקה בתוך מתחם ההכרזה של UNESCO (העיר הלבנה) — סביר ויידרש בירור פרטני";
    } else if (tlv.error) {
      // Authoritative source failed; we can't be certain.
      isConservation = false;
      confidence = "unknown";
      source = "unknown";
      reason = `מקור עיריית ת"א לא זמין כעת (${tlv.error})`;
    } else {
      // Confirmed absence: TLV responded, no record, and outside buffer.
      isConservation = false;
      confidence = centroidX != null ? "high" : "medium";
      source = "tlv_opendata";
    }

    return new Response(
      JSON.stringify({
        isConservation,
        level,
        inUnescoBuffer,
        confidence,
        source,
        reason,
        details: {
          address: tlv.address ?? undefined,
          planRef: isConservation ? "תא/2650/ב" : undefined,
        },
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
        confidence: "unknown",
        source: "error",
        reason: e instanceof Error ? e.message : "unexpected error",
      }),
      {
        status: 200, // never break the caller's flow
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
