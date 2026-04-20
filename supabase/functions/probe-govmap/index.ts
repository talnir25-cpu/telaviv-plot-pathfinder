// Probe endpoint to find a working parcel-by-XY service
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const x = 178942.2484;
  const y = 664765.5119;
  const baseHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Origin": "https://www.govmap.gov.il",
    "Referer": "https://www.govmap.gov.il/",
  };

  const probes: Array<{ name: string; init: RequestInit; url: string }> = [
    {
      name: "IdentifyByXY",
      url: "https://ags.govmap.gov.il/Identify/IdentifyByXY",
      init: {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify({
          x, y, mapTolerance: 5, IsPersonalSite: false,
          layers: [{ LayerType: 0, LayerName: "PARCEL_ALL" }],
        }),
      },
    },
    {
      name: "GetParcelByXY",
      url: "https://ags.govmap.gov.il/Search/GetParcelByXY",
      init: { method: "POST", headers: baseHeaders, body: JSON.stringify({ x, y }) },
    },
    {
      name: "PlanInstructions",
      url: `https://ags.govmap.gov.il/PlanInstructions/GetParcelByXY?x=${x}&y=${y}`,
      init: { method: "GET", headers: baseHeaders },
    },
    {
      name: "ArcGIS_Parcel",
      url: `https://ags.govmap.gov.il/arcgis/rest/services/PARCEL_ALL/MapServer/0/query?f=json&geometry=${x},${y}&geometryType=esriGeometryPoint&inSR=2039&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false`,
      init: { method: "GET", headers: baseHeaders },
    },
    {
      name: "ArcGIS_Identify",
      url: `https://ags.govmap.gov.il/arcgis/rest/services/PARCEL_ALL/MapServer/identify?f=json&geometry=${x},${y}&geometryType=esriGeometryPoint&sr=2039&layers=all&tolerance=5&mapExtent=${x-100},${y-100},${x+100},${y+100}&imageDisplay=400,400,96`,
      init: { method: "GET", headers: baseHeaders },
    },
    {
      name: "PARCEL_OWNERSHIP",
      url: `https://ags.govmap.gov.il/arcgis/rest/services/PARCEL_OWNERSHIP/MapServer/0/query?f=json&geometry=${x},${y}&geometryType=esriGeometryPoint&inSR=2039&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=false`,
      init: { method: "GET", headers: baseHeaders },
    },
  ];

  const results: Array<{ name: string; status: number; preview: string }> = [];
  for (const p of probes) {
    try {
      const r = await fetch(p.url, p.init);
      const t = await r.text();
      results.push({ name: p.name, status: r.status, preview: t.slice(0, 300) });
    } catch (e) {
      results.push({ name: p.name, status: 0, preview: String(e).slice(0, 200) });
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
