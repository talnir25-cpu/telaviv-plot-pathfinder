// Geocode a Tel Aviv address → Gush/Helka via GovMap public search
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface GeocodeResult {
  gush: number;
  helka: number;
  address: string;
  x?: number;
  y?: number;
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

    const query = address.trim();

    // Step 1: GovMap free search to resolve address → x/y (ITM coordinates)
    const searchRes = await fetch("https://ags.govmap.gov.il/Search/FreeSearch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
      body: JSON.stringify({
        keyword: query,
        LstResult: null,
      }),
    });

    if (!searchRes.ok) {
      throw new Error(`GovMap search failed: ${searchRes.status}`);
    }

    const searchJson = await searchRes.json();
    const addresses = searchJson?.data?.ADDRESS ?? searchJson?.Data?.ADDRESS ?? [];
    const first = Array.isArray(addresses) ? addresses[0] : null;

    if (!first) {
      return new Response(
        JSON.stringify({ error: "לא נמצאה כתובת תואמת. נסה/י כתובת מלאה כולל מספר בית ועיר." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const x = Number(first.X ?? first.x);
    const y = Number(first.Y ?? first.y);
    const resolvedAddress = first.ResultLable ?? first.Value ?? first.DisplayText ?? query;

    if (!x || !y) {
      throw new Error("לא הוחזרו קואורדינטות מהשירות");
    }

    // Step 2: Identify parcel at point via GovMap Parcel_All layer
    const identifyUrl =
      "https://ags.govmap.gov.il/Identify/IdentifyByXY";
    const identifyRes = await fetch(identifyUrl, {
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
        layers: [
          { LayerType: 0, LayerName: "PARCEL_ALL" },
        ],
      }),
    });

    if (!identifyRes.ok) {
      throw new Error(`GovMap identify failed: ${identifyRes.status}`);
    }

    const idJson = await identifyRes.json();
    const layerData =
      idJson?.data?.[0]?.Result?.[0]?.tabs?.[0]?.fields ??
      idJson?.data?.[0]?.Result?.[0]?.fields ??
      [];

    const fieldsObj: Record<string, string> = {};
    for (const f of layerData) {
      const k = f?.FieldName ?? f?.fieldName;
      const v = f?.FieldValue ?? f?.fieldValue;
      if (k) fieldsObj[String(k)] = String(v ?? "");
    }

    // Field names in PARCEL_ALL: GUSH_NUM, PARCEL (helka)
    const gush =
      Number(fieldsObj["GUSH_NUM"] ?? fieldsObj["gush_num"] ?? fieldsObj["Gush"] ?? 0);
    const helka =
      Number(fieldsObj["PARCEL"] ?? fieldsObj["parcel"] ?? fieldsObj["Helka"] ?? 0);

    if (!gush || !helka) {
      return new Response(
        JSON.stringify({
          error: "לא נמצא גוש/חלקה עבור הכתובת. נסה/י כתובת אחרת.",
          debug: fieldsObj,
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result: GeocodeResult = {
      gush,
      helka,
      address: resolvedAddress,
      x,
      y,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("geocode-address error:", err);
    const msg = err instanceof Error ? err.message : "שגיאה לא ידועה";
    return new Response(
      JSON.stringify({ error: `שגיאה בחיפוש כתובת: ${msg}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
