// Geocode a Tel Aviv address → Gush/Helka via GovMap.
// Step 1: FreeSearch returns ITM X/Y for the address.
// Step 2: IdentifyByXY against PARCEL_ALL returns the Gush/Helka.
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

// ITM (EPSG:2039) → WGS84 — for client-side map display
function itmToWgs84(x: number, y: number): { lat: number; lon: number } {
  const a = 6378137.0;
  const f = 1 / 298.257222100883;
  const e2 = 2 * f - f * f;
  const k0 = 1.0000067;
  const lat0 = (31.7343936111111 * Math.PI) / 180;
  const lon0 = (35.2045169444444 * Math.PI) / 180;
  const x0 = 219529.584;
  const y0 = 626907.39;

  const M0 = a * (
    (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * lat0
    - (3 * e2 / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * lat0)
    + ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * lat0)
    - ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * lat0)
  );
  const M = M0 + (y - y0) / k0;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
  const phi1 = mu
    + ((3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu)
    + ((21 * e1 * e1) / 16 - (55 * Math.pow(e1, 4)) / 32) * Math.sin(4 * mu)
    + ((151 * Math.pow(e1, 3)) / 96) * Math.sin(6 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);
  const ep2 = e2 / (1 - e2);
  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = ep2 * cosPhi1 * cosPhi1;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = (x - x0) / (N1 * k0);

  const phi = phi1 - ((N1 * tanPhi1) / R1) * (
    (D * D) / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4)) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6)) / 720
  );
  const lam = lon0 + (
    D
    - ((1 + 2 * T1 + C1) * Math.pow(D, 3)) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5)) / 120
  ) / cosPhi1;

  return { lat: (phi * 180) / Math.PI, lon: (lam * 180) / Math.PI };
}

interface ParcelField {
  FieldName?: string;
  FieldValue?: string;
  fieldName?: string;
  fieldValue?: string;
}

interface ParcelMatch {
  gush: number;
  helka: number;
  centroidX: number;
  centroidY: number;
}

function extractParcels(idJson: unknown): ParcelMatch[] {
  const root = idJson as { data?: Array<Record<string, unknown>> };
  const dataArr = root?.data ?? [];
  const parcels: ParcelMatch[] = [];

  for (const layer of dataArr) {
    const results = (layer.Result as unknown[]) ?? [];
    for (const r of results) {
      const rr = r as Record<string, unknown>;
      const fields: ParcelField[] = [];
      const tabs = (rr.tabs as unknown[]) ?? [];
      for (const t of tabs) {
        const tt = t as Record<string, unknown>;
        if (Array.isArray(tt.fields)) {
          for (const f of tt.fields) fields.push(f as ParcelField);
        }
      }
      if (Array.isArray(rr.fields)) {
        for (const f of rr.fields) fields.push(f as ParcelField);
      }

      let gush = 0;
      let helka = 0;
      for (const f of fields) {
        const name = (f.FieldName ?? f.fieldName ?? "").trim();
        const value = String(f.FieldValue ?? f.fieldValue ?? "").trim();
        if (!value) continue;
        if (name === "מספר גוש" || name === "גוש" || /^GUSH/i.test(name)) {
          gush = Number(value);
        } else if (name === "מספר חלקה" || name === "חלקה" || /^PARCEL/i.test(name)) {
          helka = Number(value);
        }
      }
      const centroid = rr.centroid as { x?: number; y?: number } | undefined;
      if (gush && helka) {
        parcels.push({
          gush,
          helka,
          centroidX: Number(centroid?.x) || 0,
          centroidY: Number(centroid?.y) || 0,
        });
      }
    }
  }
  return parcels;
}

function pickBestParcel(parcels: ParcelMatch[], x: number, y: number): ParcelMatch | null {
  if (parcels.length === 0) return null;
  if (parcels.length === 1) return parcels[0];
  // Pick the parcel whose centroid is closest to the search point — handles
  // the case where the address X/Y falls on a parcel boundary and GovMap
  // returns multiple matches (or the wrong one is first).
  return parcels.reduce((best, p) => {
    const dB = Math.hypot(best.centroidX - x, best.centroidY - y);
    const dP = Math.hypot(p.centroidX - x, p.centroidY - y);
    return dP < dB ? p : best;
  });
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { address, debug } = body;
    if (!address || typeof address !== "string" || address.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "כתובת לא תקינה" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let query = address.trim();
    if (!/תל[\s-]?אביב|tel\s*aviv|יפו|jaffa/i.test(query)) {
      query = `${query} תל אביב`;
    }

    // Step 1: FreeSearch → X/Y
    const searchRes = await fetch("https://ags.govmap.gov.il/Search/FreeSearch", {
      method: "POST",
      headers: GOVMAP_HEADERS,
      body: JSON.stringify({ keyword: query, LstResult: null }),
    });
    const searchText = await searchRes.text();
    if (!searchRes.ok) {
      throw new Error(`GovMap FreeSearch ${searchRes.status}: ${searchText.slice(0, 120)}`);
    }
    let searchJson: { data?: { Result?: Array<Record<string, unknown>> } };
    try {
      searchJson = JSON.parse(searchText);
    } catch {
      throw new Error(`FreeSearch לא תקין: ${searchText.slice(0, 120)}`);
    }

    const allResults = (searchJson?.data?.Result ?? []) as Array<Record<string, unknown>>;
    if (allResults.length === 0) {
      return new Response(
        JSON.stringify({ error: "לא נמצאה כתובת תואמת. נסה/י כתובת מלאה כולל מספר בית." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── CRITICAL: pick the right result type ───
    // GovMap FreeSearch returns mixed results (address, street midpoint, parcel,
    // POI, city) — and they all carry ResultType:1, so we cannot rely on that.
    // The real differentiator is DescLayerID:
    //   ADDR_V1          = actual building/address point (what we want)
    //   STREET_MID_POINT = street centerline midpoint (random parcel along the street!)
    //   POI_MID_POINT    = point of interest (museum, school, …)
    //   SETL_MID_POINT   = settlement / city
    //   PARCEL_ALL_V1    = a parcel match (gush/helka in text)
    // Bug fixed: previously we took Result[0] blindly, which picked a STREET_MID_POINT
    // when the user omitted the house number — yielding a wrong helka along the street.
    const descLayerOf = (r: Record<string, unknown>) =>
      String(r.DescLayerID ?? "").toUpperCase();
    const addressHit = allResults.find((r) => descLayerOf(r) === "ADDR_V1");
    const parcelHit = allResults.find((r) => descLayerOf(r).startsWith("PARCEL"));
    const first = addressHit ?? parcelHit;
    const fallback = allResults[0];

    if (!first) {
      const layer = descLayerOf(fallback);
      const isStreet = layer === "STREET_MID_POINT";
      const isCity = layer === "SETL_MID_POINT";
      const msg = isStreet
        ? "נמצא רק שם הרחוב — הוסף/י מספר בית כדי לאתר את החלקה המדויקת."
        : isCity
        ? "נמצאה רק עיר — נסה/י כתובת מלאה (רחוב + מספר בית)."
        : "לא נמצאה כתובת מדויקת. נסה/י כתובת מלאה כולל מספר בית.";
      return new Response(
        JSON.stringify({ error: msg, partial: String(fallback?.ResultLable ?? "") }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const x = Number(first.X);
    const y = Number(first.Y);
    const resolvedAddress = String(first.ResultLable ?? query);
    if (!x || !y) throw new Error("התקבלה כתובת ללא קואורדינטות");

    // ─── Shortcut: parcel-type result already carries gush/helka ───
    if (descLayerOf(first).startsWith("PARCEL")) {
      const gushStr = String(first.Gush ?? "").trim();
      const parcelStr = String(first.Parcel ?? "").trim();
      const g = Number(gushStr);
      const h = Number(parcelStr);
      if (g && h) {
        const { lat, lon } = itmToWgs84(x, y);
        return new Response(
          JSON.stringify({ gush: g, helka: h, address: resolvedAddress, x, y, lat, lon }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Step 2: IdentifyByXY → Gush/Helka.
    // Tight tolerance first (address points sit inside the parcel polygon);
    // widen only if no match, to avoid sweeping in adjacent parcels.
    const identifyAt = async (tol: number) => {
      const r = await fetch("https://ags.govmap.gov.il/Identify/IdentifyByXY", {
        method: "POST",
        headers: GOVMAP_HEADERS,
        body: JSON.stringify({
          x, y, mapTolerance: tol, IsPersonalSite: false,
          layers: [{ LayerType: 0, LayerName: "PARCEL_ALL" }],
        }),
      });
      const t = await r.text();
      if (!r.ok) throw new Error(`GovMap Identify ${r.status}: ${t.slice(0, 120)}`);
      try { return JSON.parse(t); } catch { throw new Error(`Identify לא תקין: ${t.slice(0, 120)}`); }
    };

    let idJson = await identifyAt(2);
    let parcels = extractParcels(idJson);
    if (parcels.length === 0) {
      idJson = await identifyAt(15);
      parcels = extractParcels(idJson);
    }
    const best = pickBestParcel(parcels, x, y);
    const { lat, lon } = itmToWgs84(x, y);

    if (!best) {
      return new Response(
        JSON.stringify({
          error: "לא נמצא גוש/חלקה עבור הכתובת. נסה/י כתובת מדויקת יותר.",
          address: resolvedAddress,
          x, y, lat, lon,
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        gush: best.gush,
        helka: best.helka,
        address: resolvedAddress,
        x, y, lat, lon,
        candidates: parcels.length > 1
          ? parcels.map((p) => ({
              gush: p.gush,
              helka: p.helka,
              dist: Math.round(Math.hypot(p.centroidX - x, p.centroidY - y)),
            }))
          : undefined,
        ...(debug ? { _debugSearch: searchJson, _debugIdentify: idJson, _debugFirst: first } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );


  } catch (err) {
    console.error("geocode-address error:", err);
    const msg = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return new Response(
      JSON.stringify({ error: `שגיאה בחיפוש כתובת: ${msg}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
