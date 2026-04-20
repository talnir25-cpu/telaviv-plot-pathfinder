// Geocode a Tel Aviv address → Gush/Helka
// 1) Nominatim (OpenStreetMap) for address → lat/lon
// 2) Convert WGS84 → ITM (Israeli Transverse Mercator)
// 3) GovMap Parcel_All identify by X/Y → Gush/Helka
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// WGS84 (lat/lon) → ITM (EPSG:2039) using a standard implementation
// of the Israeli Transverse Mercator projection.
function wgs84ToItm(lat: number, lon: number): { x: number; y: number } {
  // GRS80 / ITM parameters
  const a = 6378137.0;
  const f = 1 / 298.257222100883;
  const e2 = 2 * f - f * f;
  const k0 = 1.0000067;
  const lat0 = (31.7343936111111 * Math.PI) / 180;
  const lon0 = (35.2045169444444 * Math.PI) / 180;
  const x0 = 219529.584;
  const y0 = 626907.39;

  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  const dl = lam - lon0;

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const N = a / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const ep2 = e2 / (1 - e2);
  const C = ep2 * cosPhi * cosPhi;
  const A = cosPhi * dl;

  // Meridional arc M(phi)
  const M = a * (
    (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * phi
    - (3 * e2 / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * phi)
    + ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * phi)
    - ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * phi)
  );
  const M0 = a * (
    (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * lat0
    - (3 * e2 / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * lat0)
    + ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * lat0)
    - ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * lat0)
  );

  const x =
    x0 +
    k0 * N * (A + ((1 - T + C) * Math.pow(A, 3)) / 6 +
      ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5)) / 120);
  const y =
    y0 +
    k0 * (M - M0 + N * tanPhi *
      (Math.pow(A, 2) / 2 +
        ((5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4)) / 24 +
        ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6)) / 720));

  return { x: Math.round(x), y: Math.round(y) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { address } = await req.json();
    if (!address || typeof address !== "string" || address.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "כתובת לא תקינה" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let query = address.trim();
    // Bias to Tel Aviv-Yafo if user didn't include a city
    if (!/תל[\s-]?אביב|tel\s*aviv|יפו|jaffa/i.test(query)) {
      query = `${query}, תל אביב יפו`;
    }

    // Step 1: Nominatim
    const nomUrl =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=il&accept-language=he&q=${encodeURIComponent(query)}`;
    const nomRes = await fetch(nomUrl, {
      headers: {
        "User-Agent": "TelAvivFeasibilityApp/1.0 (lovable.dev)",
        "Accept": "application/json",
      },
    });
    if (!nomRes.ok) {
      const txt = await nomRes.text();
      throw new Error(`Nominatim ${nomRes.status}: ${txt.slice(0, 100)}`);
    }
    const nomData = await nomRes.json();
    if (!Array.isArray(nomData) || nomData.length === 0) {
      return new Response(
        JSON.stringify({ error: "לא נמצאה כתובת תואמת. נסה/י לכלול מספר בית ועיר." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const lat = Number(nomData[0].lat);
    const lon = Number(nomData[0].lon);
    const resolvedAddress = nomData[0].display_name as string;
    if (!lat || !lon) throw new Error("Nominatim לא החזיר קואורדינטות");

    // Step 2: WGS84 → ITM
    const { x, y } = wgs84ToItm(lat, lon);

    // Step 3: GovMap identify
    const idRes = await fetch("https://ags.govmap.gov.il/Identify/IdentifyByXY", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        x,
        y,
        mapTolerance: 5,
        IsPersonalSite: false,
        layers: [{ LayerType: 0, LayerName: "PARCEL_ALL" }],
      }),
    });

    if (!idRes.ok) {
      const txt = await idRes.text();
      throw new Error(`GovMap identify ${idRes.status}: ${txt.slice(0, 120)}`);
    }
    const idText = await idRes.text();
    let idJson: unknown;
    try {
      idJson = JSON.parse(idText);
    } catch {
      throw new Error(`GovMap identify החזיר non-JSON: ${idText.slice(0, 120)}`);
    }

    // Walk possible response shapes to find fields
    const root = idJson as Record<string, unknown>;
    const dataArr =
      (root.data as unknown[]) ??
      (root.Data as unknown[]) ??
      [];
    let fields: Array<{ FieldName?: string; FieldValue?: string; fieldName?: string; fieldValue?: string }> = [];
    for (const entry of dataArr) {
      const e = entry as Record<string, unknown>;
      const results = (e.Result as unknown[]) ?? (e.result as unknown[]) ?? [];
      for (const r of results) {
        const rr = r as Record<string, unknown>;
        const tabs = (rr.tabs as unknown[]) ?? [];
        if (tabs.length) {
          for (const t of tabs) {
            const tt = t as Record<string, unknown>;
            if (Array.isArray(tt.fields)) fields = fields.concat(tt.fields as []);
          }
        }
        if (Array.isArray(rr.fields)) fields = fields.concat(rr.fields as []);
      }
    }

    const fieldsObj: Record<string, string> = {};
    for (const f of fields) {
      const k = f.FieldName ?? f.fieldName;
      const v = f.FieldValue ?? f.fieldValue;
      if (k) fieldsObj[String(k)] = String(v ?? "");
    }

    const gush = Number(
      fieldsObj["GUSH_NUM"] ?? fieldsObj["gush_num"] ?? fieldsObj["Gush"] ?? fieldsObj["gush"] ?? 0,
    );
    const helka = Number(
      fieldsObj["PARCEL"] ?? fieldsObj["parcel"] ?? fieldsObj["Helka"] ?? fieldsObj["helka"] ?? 0,
    );

    if (!gush || !helka) {
      console.log("identify response (no gush/helka):", JSON.stringify(idJson).slice(0, 500));
      return new Response(
        JSON.stringify({
          error: "לא נמצא גוש/חלקה עבור הכתובת. נסה/י כתובת מדויקת יותר.",
          resolvedAddress,
          coords: { lat, lon, x, y },
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ gush, helka, address: resolvedAddress, x, y }),
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
