// Multi-source lookup for existing dwelling units on a plot.
//
// Sources (run in parallel):
//   1. nadlan          — counts distinct sub-parcel numbers (תת-חלקה) from
//                        nadlan.gov.il deals → lower bound on apartments.
//   2. govmap_bldg     — Identify on GovMap BUILDINGS layer at parcel centroid,
//                        derives floor area × floors → estimated units.
//   3. heuristic       — Fallback when nothing else returned data.
//
// Aggregator picks the highest-confidence value and stores all raw results
// in `plot_units_cache.sources_json` for diagnostics.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GOVMAP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Origin: "https://www.govmap.gov.il",
  Referer: "https://www.govmap.gov.il/",
};

const AVG_UNIT_AREA = 80;

type SourceName = "nadlan" | "govmap_bldg" | "tlv_permits" | "heuristic" | "manual";
type Confidence = "high" | "medium" | "low" | "very_low";
type SourceStatus = "ok" | "empty" | "error" | "skipped";

interface SourceResult {
  source: SourceName;
  units: number | null;
  floors: number | null;
  totalFloorArea: number | null;
  confidence: Confidence;
  status: SourceStatus;
  label: string;            // Hebrew label for UI
  detail: string;           // Short Hebrew explanation
  errorMsg?: string;
  durationMs: number;
  raw?: unknown;            // Compact debug payload
}

interface RequestBody {
  gush: number;
  helka: number;
  plotArea?: number | null;
  refresh?: boolean;
  manualUnits?: number;
  manualFloors?: number;
  manualBuiltArea?: number;
  manualNotes?: string;
}

// ─────────────────────────── Helpers ───────────────────────────

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - t0) };
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms)),
  ]);
}

// ─────────────────────── Source 1: Nadlan ──────────────────────
// Uses the GovMap real-estate API. We first need a polygon_id for the parcel,
// which we get via /api/real-estate/deals/{x,y}/{radius} where x/y are in
// Web Mercator (EPSG:3857). The parcel centroid (ITM) is fetched from
// GetParcelData, then converted.

function itmToWebMercator(xItm: number, yItm: number): { x: number; y: number } {
  // ITM → WGS84 → Web Mercator. Reuse approximation good enough for radius lookups.
  const a = 6378137.0;
  const f = 1 / 298.257222100883;
  const e2 = 2 * f - f * f;
  const k0 = 1.0000067;
  const lat0 = (31.7343936111111 * Math.PI) / 180;
  const lon0 = (35.2045169444444 * Math.PI) / 180;
  const x0 = 219529.584;
  const y0 = 626907.39;
  const M0 = a * (
    (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * lat0
    - (3 * e2 / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * lat0)
    + ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * lat0)
    - ((35 * e2 ** 3) / 3072) * Math.sin(6 * lat0)
  );
  const M = M0 + (yItm - y0) / k0;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const phi1 = mu
    + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);
  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);
  const ep2 = e2 / (1 - e2);
  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = ep2 * cosPhi1 * cosPhi1;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = (xItm - x0) / (N1 * k0);
  const phi = phi1 - ((N1 * tanPhi1) / R1) * (
    (D * D) / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4)) / 24
  );
  const lam = lon0 + (
    D - ((1 + 2 * T1 + C1) * Math.pow(D, 3)) / 6
  ) / cosPhi1;
  const lat = (phi * 180) / Math.PI;
  const lon = (lam * 180) / Math.PI;
  // WGS84 → Web Mercator
  const R = 6378137.0;
  return {
    x: R * (lon * Math.PI / 180),
    y: R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)),
  };
}

async function getParcelCentroidItm(
  gush: number,
  helka: number,
): Promise<{ x: number; y: number; via: string } | null> {
  // Strategy A: GetParcelData (fast, works when it works)
  try {
    const r = await fetch("https://ags.govmap.gov.il/Common/GetParcelData", {
      method: "POST",
      headers: GOVMAP_HEADERS,
      body: JSON.stringify({ gush, helka }),
    });
    if (r.ok) {
      const j = await r.json();
      const data = j?.data ?? j;
      const x = Number(data?.X ?? data?.x ?? data?.centerX);
      const y = Number(data?.Y ?? data?.y ?? data?.centerY);
      if (x && y) return { x, y, via: "GetParcelData" };
    } else {
      await r.text();
    }
  } catch {
    /* fall through */
  }

  // Strategy B: FreeSearch with "גוש X חלקה Y" (more robust)
  try {
    const keyword = `גוש ${gush} חלקה ${helka}`;
    const r = await fetch("https://ags.govmap.gov.il/Search/FreeSearch", {
      method: "POST",
      headers: GOVMAP_HEADERS,
      body: JSON.stringify({ keyword, LstResult: null }),
    });
    if (r.ok) {
      const j = await r.json();
      const first = j?.data?.Result?.[0];
      const x = Number(first?.X);
      const y = Number(first?.Y);
      if (x && y) return { x, y, via: "FreeSearch" };
    }
  } catch {
    /* fall through */
  }

  return null;
}

interface NadlanDeal {
  gushNum?: number;
  parcelNum?: number;
  subParcelNum?: number;
  houseNum?: number;
  floorNo?: string;
  assetArea?: number;
  dealDate?: string;
}

async function sourceNadlan(
  gush: number,
  helka: number,
  centroidWm: { x: number; y: number } | null,
): Promise<Omit<SourceResult, "durationMs">> {
  const base: Omit<SourceResult, "durationMs"> = {
    source: "nadlan",
    units: null,
    floors: null,
    totalFloorArea: null,
    confidence: "medium",
    status: "skipped",
    label: 'נדל"ן הממשלתי',
    detail: "ספירת תת-חלקות שנמכרו",
  };
  if (!centroidWm) {
    return { ...base, status: "error", errorMsg: "אין centroid לחלקה" };
  }

  try {
    // Step 1: find polygon_ids in a 60m radius
    const dealsUrl = `https://www.govmap.gov.il/api/real-estate/deals/${centroidWm.x},${centroidWm.y}/60`;
    const dr = await withTimeout(
      fetch(dealsUrl, { headers: GOVMAP_HEADERS }),
      8000,
      "deals-by-radius",
    );
    if (!dr.ok) {
      await dr.text();
      return { ...base, status: "error", errorMsg: `deals ${dr.status}` };
    }
    const dList = (await dr.json()) as Array<{ polygon_id?: string }>;
    const polygonIds = Array.from(new Set(dList.map((d) => d.polygon_id).filter(Boolean))) as string[];

    // Step 2: for each polygon, fetch its deals and keep those matching our gush/helka
    const allDeals: NadlanDeal[] = [];
    for (const pid of polygonIds.slice(0, 6)) {
      try {
        const sr = await withTimeout(
          fetch(`https://www.govmap.gov.il/api/real-estate/street-deals/${pid}`, { headers: GOVMAP_HEADERS }),
          8000,
          `street-deals/${pid}`,
        );
        if (!sr.ok) {
          await sr.text();
          continue;
        }
        const j = await sr.json();
        const arr: NadlanDeal[] = j?.data ?? [];
        for (const d of arr) {
          if (d.gushNum === gush && d.parcelNum === helka) allDeals.push(d);
        }
      } catch {
        // continue
      }
    }

    if (allDeals.length === 0) {
      return { ...base, status: "empty", detail: "לא נמצאו עסקאות בחלקה" };
    }

    // Count distinct sub-parcels (each = one apartment)
    const subParcels = new Set<number>();
    let maxSub = 0;
    let topFloor = 0;
    const floorMap: Record<string, number> = {
      "קרקע": 0, "ראשונה": 1, "שניה": 2, "שלישית": 3,
      "רביעית": 4, "חמישית": 5, "שישית": 6, "שביעית": 7,
      "שמינית": 8, "תשיעית": 9, "עשירית": 10,
    };
    for (const d of allDeals) {
      if (typeof d.subParcelNum === "number") {
        subParcels.add(d.subParcelNum);
        if (d.subParcelNum > maxSub) maxSub = d.subParcelNum;
      }
      const f = d.floorNo ? floorMap[d.floorNo.trim()] : undefined;
      if (typeof f === "number" && f > topFloor) topFloor = f;
    }

    // The true unit count is at least max(maxSub, |distinct|), since sub-parcel
    // numbers are typically sequential 1..N.
    const lowerBound = Math.max(maxSub, subParcels.size);

    // סיכום שטח דירות ייחודיות (קצה תחתון של שטח בנוי דירות בלבד, ללא שטחי שירות)
    const areaBySub = new Map<number, number>();
    for (const d of allDeals) {
      if (typeof d.subParcelNum === "number" && typeof d.assetArea === "number" && d.assetArea > 10) {
        const prev = areaBySub.get(d.subParcelNum) ?? 0;
        if (d.assetArea > prev) areaBySub.set(d.subParcelNum, d.assetArea);
      }
    }
    const summedArea = Array.from(areaBySub.values()).reduce((s, v) => s + v, 0);

    return {
      ...base,
      status: "ok",
      units: lowerBound,
      floors: topFloor > 0 ? topFloor + 1 : null,
      totalFloorArea: summedArea > 0 ? Math.round(summedArea) : null,
      detail: `${allDeals.length} עסקאות, ${subParcels.size} תת-חלקות שונות${summedArea > 0 ? ` · ${Math.round(summedArea).toLocaleString()} מ"ר נמכר` : ""}`,
      raw: {
        dealsCount: allDeals.length,
        subParcels: Array.from(subParcels).sort((a, b) => a - b),
        maxSubParcel: maxSub,
        summedSoldArea: Math.round(summedArea),
        sample: allDeals.slice(0, 3).map((d) => ({
          subParcel: d.subParcelNum,
          floor: d.floorNo,
          area: d.assetArea,
          date: d.dealDate?.slice(0, 10),
        })),
      },
    };
  } catch (e) {
    return { ...base, status: "error", errorMsg: e instanceof Error ? e.message : String(e) };
  }
}

// ───────────────────── Source 2: GovMap BLDG ───────────────────

interface BuildingInfo {
  floors: number | null;
  area: number | null;
}

async function sourceGovmapBldg(
  gush: number,
  helka: number,
  plotArea: number | null,
  centroid: { x: number; y: number } | null,
): Promise<Omit<SourceResult, "durationMs">> {
  const base: Omit<SourceResult, "durationMs"> = {
    source: "govmap_bldg",
    units: null,
    floors: null,
    totalFloorArea: null,
    confidence: "low",
    status: "skipped",
    label: "GovMap מבנים",
    detail: "שטח מבנה × קומות ÷ 80",
  };
  if (!centroid) {
    return { ...base, status: "error", errorMsg: "אין centroid לחלקה" };
  }

  const layerNames = ["BUILDINGS", "BLDG", "BUILDING_ALL"];
  const buildings: BuildingInfo[] = [];
  let lastErr = "";

  // Dynamic tolerance based on plot size — larger plots need a wider search
  // radius so we catch buildings that aren't exactly under the centroid.
  // Default 35m; grows with sqrt(plotArea/π) + 10m buffer; capped at 80m.
  const dynTolerance = plotArea
    ? Math.min(80, Math.max(35, Math.round(Math.sqrt(plotArea / Math.PI) + 10)))
    : 40;

  for (const layerName of layerNames) {
    try {
      const r = await withTimeout(
        fetch("https://ags.govmap.gov.il/Identify/IdentifyByXY", {
          method: "POST",
          headers: GOVMAP_HEADERS,
          body: JSON.stringify({
            x: centroid.x,
            y: centroid.y,
            mapTolerance: dynTolerance,
            IsPersonalSite: false,
            layers: [{ LayerType: 0, LayerName: layerName }],
          }),
        }),
        8000,
        `BLDG/${layerName}`,
      );
      if (!r.ok) {
        await r.text();
        lastErr = `${layerName} ${r.status}`;
        continue;
      }
      const j = await r.json();
      const dataArr = j?.data ?? [];
      for (const layer of dataArr) {
        const results = (layer as { Result?: unknown[] }).Result ?? [];
        for (const rr of results) {
          const obj = rr as Record<string, unknown>;
          const fields: Array<Record<string, unknown>> = [];
          const tabs = (obj.tabs as Array<Record<string, unknown>>) ?? [];
          for (const t of tabs) {
            if (Array.isArray(t.fields)) for (const f of t.fields) fields.push(f as Record<string, unknown>);
          }
          if (Array.isArray(obj.fields)) for (const f of obj.fields) fields.push(f as Record<string, unknown>);

          let floors: number | null = null;
          let area: number | null = null;
          for (const f of fields) {
            const name = String(f.FieldName ?? f.fieldName ?? "").trim();
            const value = String(f.FieldValue ?? f.fieldValue ?? "").trim();
            if (!value) continue;
            if (/קומות|FLOORS|NUM_FLOORS|FloorsNum/i.test(name)) {
              const n = Number(value);
              if (!isNaN(n) && n > 0) floors = n;
            } else if (/שטח|AREA|BLDG_AREA|SHAPE_Area/i.test(name)) {
              const n = Number(value);
              if (!isNaN(n) && n > 10) area = n;
            }
          }
          if (floors !== null || area !== null) buildings.push({ floors, area });
        }
      }
      if (buildings.length > 0) break;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  if (buildings.length === 0) {
    return { ...base, status: lastErr ? "error" : "empty", errorMsg: lastErr || undefined };
  }

  // Distinguish "real measured floors" from heuristic fallbacks.
  const buildingsWithRealFloors = buildings.filter((b) => b.floors !== null && b.floors !== undefined);
  const hasRealFloors = buildingsWithRealFloors.length > 0;

  let totalFloorArea = 0;
  let maxFloors = 0;
  let maxRealFloors = 0;
  for (const b of buildings) {
    const floors = b.floors ?? 3;
    const footprint = b.area ?? (plotArea ? plotArea * 0.4 : 150);
    totalFloorArea += footprint * floors;
    if (floors > maxFloors) maxFloors = floors;
    if (b.floors !== null && b.floors !== undefined && b.floors > maxRealFloors) {
      maxRealFloors = b.floors;
    }
  }
  const units = Math.max(1, Math.round(totalFloorArea / AVG_UNIT_AREA));
  const reportedFloors = hasRealFloors ? maxRealFloors : maxFloors;

  // Confidence: "high" when we have actual measured floors (physical GIS
  // measurement = ground truth for floor count, regardless of unit estimate).
  // Falls back to "low" when floors were synthesized.
  const confidence: Confidence = hasRealFloors ? "high" : "low";

  return {
    ...base,
    status: "ok",
    units,
    floors: reportedFloors || null,
    totalFloorArea: Math.round(totalFloorArea),
    confidence,
    detail: hasRealFloors
      ? `${buildings.length} מבנה(ים) · ${maxRealFloors} קומות (מדידה פיזית)`
      : `${buildings.length} מבנה(ים), קומות לא מדודות`,
    raw: { buildings, hasRealFloors, buildingsWithRealFloors: buildingsWithRealFloors.length },
  };
}

// ───────────────── Source 3: TLV building permits ──────────────
// Tel Aviv-Yafo municipality ArcGIS REST FeatureServer layer 772.
// Each polygon = a building permit, with explicit `yechidot_diyur`
// (dwelling units) field. Authoritative for plots inside Tel Aviv.

interface TlvPermitFeature {
  attributes: {
    request_num?: number;
    permission_date?: number | null;
    permission_num?: number | null;
    expiry_date?: number | null;
    occupation?: string | null;
    finished?: string | null;
    building_num?: number | null;
    yechidot_diyur?: number | null;
    sw_tama_38?: string | null;
    sw_tama_38_chadash?: string | null;
    sw_tama_38_tosefet?: string | null;
    building_stage?: string | null;
    ms_tik_binyan?: number | null;
    addresses?: string | null;
    sug_bakasha?: string | null;
    // שטחי בנייה — שמות שדה אפשריים בשכבה 772
    shetach_kolel?: number | null;
    shetach_eikari?: number | null;
    shetach_sherut?: number | null;
    sach_hakol_shetach?: number | null;
    shetach_binyan?: number | null;
    total_area?: number | null;
    [key: string]: unknown;
  };
}

// בוחר את שדה השטח הזמין מתוך מספר שמות אפשריים
function tlvPermitArea(a: TlvPermitFeature["attributes"]): number | null {
  const sum = (a.shetach_eikari ?? 0) + (a.shetach_sherut ?? 0);
  const candidates: Array<number | null | undefined> = [
    a.shetach_kolel,
    a.sach_hakol_shetach,
    a.total_area,
    a.shetach_binyan,
    sum > 0 ? sum : null,
  ];
  for (const v of candidates) {
    if (typeof v === "number" && v > 20) return v;
  }
  return null;
}

function tlvStageRank(stage?: string | null, occupation?: string | null, finished?: string | null): number {
  // Higher = closer to "built and inhabited"
  if (occupation && occupation.trim()) return 100;
  if (finished && finished.trim()) return 90;
  const s = (stage ?? "").trim();
  if (s.includes("תעודת גמר")) return 95;
  if (s.includes("אכלוס")) return 90;
  if (s.includes("קיים היתר")) return 70;
  if (s.includes("בתהליך")) return 40;
  return 10;
}

async function sourceTlvPermits(
  centroidItm: { x: number; y: number } | null,
): Promise<Omit<SourceResult, "durationMs">> {
  const base: Omit<SourceResult, "durationMs"> = {
    source: "tlv_permits",
    units: null,
    floors: null,
    totalFloorArea: null,
    confidence: "high",
    status: "skipped",
    label: 'עיריית ת"א - היתרי בניה',
    detail: 'שדה yechidot_diyur מההיתר הרלוונטי',
  };
  if (!centroidItm) {
    return { ...base, status: "error", errorMsg: "אין centroid לחלקה" };
  }

  const LAYER_URL =
    "https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/772/query";

  async function queryFeatures(
    geometry: string,
    geometryType: "esriGeometryPoint" | "esriGeometryEnvelope",
  ): Promise<TlvPermitFeature[]> {
    const params = new URLSearchParams({
      f: "json",
      where: "1=1",
      geometry,
      geometryType,
      inSR: "2039",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "*",
      returnGeometry: "false",
      outSR: "2039",
    });
    const r = await withTimeout(
      fetch(`${LAYER_URL}?${params.toString()}`, {
        headers: { Accept: "application/json" },
      }),
      8000,
      `tlv-permits/${geometryType}`,
    );
    if (!r.ok) {
      await r.text();
      throw new Error(`status ${r.status}`);
    }
    const j = await r.json();
    return (j?.features ?? []) as TlvPermitFeature[];
  }

  try {
    // Pass 1: exact point
    const pointGeom = JSON.stringify({ x: centroidItm.x, y: centroidItm.y, spatialReference: { wkid: 2039 } });
    let features = await queryFeatures(pointGeom, "esriGeometryPoint");

    // Pass 2: 15m envelope around centroid (catches multi-building plots)
    if (features.length === 0) {
      const d = 15;
      const env = JSON.stringify({
        xmin: centroidItm.x - d,
        ymin: centroidItm.y - d,
        xmax: centroidItm.x + d,
        ymax: centroidItm.y + d,
        spatialReference: { wkid: 2039 },
      });
      features = await queryFeatures(env, "esriGeometryEnvelope");
    }

    if (features.length === 0) {
      return { ...base, status: "empty", detail: "לא נמצאו היתרים בחלקה" };
    }

    // Keep permits with dwellings only
    const withUnits = features.filter(
      (f) => typeof f.attributes.yechidot_diyur === "number" && f.attributes.yechidot_diyur > 0,
    );

    if (withUnits.length === 0) {
      return {
        ...base,
        status: "empty",
        detail: `נמצאו ${features.length} היתרים ללא יחידות דיור (לא מגורים?)`,
        raw: {
          permitsFound: features.length,
          sampleStages: features.slice(0, 3).map((f) => f.attributes.building_stage),
        },
      };
    }

    // Group by building file (ms_tik_binyan); per building keep the
    // most relevant permit (highest stage rank, then latest permission_date).
    const perBuilding = new Map<number, TlvPermitFeature>();
    for (const f of withUnits) {
      const key = f.attributes.ms_tik_binyan ?? f.attributes.building_num ?? f.attributes.request_num ?? Math.random();
      const cur = perBuilding.get(key);
      if (!cur) {
        perBuilding.set(key, f);
        continue;
      }
      const aRank = tlvStageRank(f.attributes.building_stage, f.attributes.occupation, f.attributes.finished);
      const bRank = tlvStageRank(cur.attributes.building_stage, cur.attributes.occupation, cur.attributes.finished);
      if (aRank > bRank) {
        perBuilding.set(key, f);
      } else if (aRank === bRank) {
        const aDate = f.attributes.permission_date ?? 0;
        const bDate = cur.attributes.permission_date ?? 0;
        if (aDate > bDate) perBuilding.set(key, f);
      }
    }

    const chosen = Array.from(perBuilding.values());

    const stages: string[] = [];
    let anyTama = false;
    for (const f of chosen) {
      if (f.attributes.building_stage) stages.push(f.attributes.building_stage);
      if (
        (f.attributes.sw_tama_38 && f.attributes.sw_tama_38 !== "לא") ||
        (f.attributes.sw_tama_38_chadash && f.attributes.sw_tama_38_chadash !== "לא") ||
        (f.attributes.sw_tama_38_tosefet && f.attributes.sw_tama_38_tosefet !== "לא")
      ) anyTama = true;
    }

    const classify = (f: TlvPermitFeature): "built" | "approved" | "in_process" | "unknown" => {
      const a = f.attributes;
      if ((a.occupation && a.occupation.trim()) || (a.finished && a.finished.trim())) return "built";
      const s = (a.building_stage ?? "").trim();
      if (s.includes("תעודת גמר") || s.includes("אכלוס")) return "built";
      if (s.includes("קיים היתר")) return "approved";
      if (s.includes("בתהליך")) return "in_process";
      return "unknown";
    };

    const chosenRaw = chosen.map((f) => {
      const physicalStatus = classify(f);
      return {
        physicalStatus,
        ms_tik_binyan: f.attributes.ms_tik_binyan,
        yechidot_diyur: f.attributes.yechidot_diyur,
        building_stage: f.attributes.building_stage,
        permission_date: f.attributes.permission_date
          ? new Date(f.attributes.permission_date).toISOString().slice(0, 10)
          : null,
        occupation: f.attributes.occupation,
        finished: f.attributes.finished,
        tama38: f.attributes.sw_tama_38,
        tama38_new: f.attributes.sw_tama_38_chadash,
        tama38_addition: f.attributes.sw_tama_38_tosefet,
        addresses: f.attributes.addresses,
        area: tlvPermitArea(f.attributes),
      };
    });

    const summary = {
      builtUnits: chosenRaw.filter((c) => c.physicalStatus === "built").reduce((s, c) => s + (c.yechidot_diyur ?? 0), 0),
      approvedUnits: chosenRaw.filter((c) => c.physicalStatus === "approved" || c.physicalStatus === "in_process").reduce((s, c) => s + (c.yechidot_diyur ?? 0), 0),
      builtArea: chosenRaw.filter((c) => c.physicalStatus === "built").reduce((s, c) => s + (c.area ?? 0), 0),
    };

    const rawPayload = {
      totalFound: features.length,
      withUnits: withUnits.length,
      chosenCount: chosen.length,
      summary,
      chosen: chosenRaw,
    };

    // Only "built" units represent the EXISTING state. Permits in
    // "in_process"/"approved" stages — especially Tama 38 — describe a
    // FUTURE unit count and must not be reported as existing.
    if (summary.builtUnits > 0) {
      return {
        ...base,
        status: "ok",
        units: summary.builtUnits,
        floors: null,
        totalFloorArea: summary.builtArea > 0 ? Math.round(summary.builtArea) : null,
        confidence: summary.approvedUnits > 0 ? "medium" : "high",
        detail: `${summary.builtUnits} יחידות בנויות${summary.builtArea > 0 ? ` · ${Math.round(summary.builtArea).toLocaleString()} מ"ר` : ""}${summary.approvedUnits > 0 ? ` (+${summary.approvedUnits} מתוכננות)` : ""}${anyTama ? " · כולל תמ\"א 38" : ""}`,
        raw: rawPayload,
      };
    }

    // Only planned/in-process permits — do not surface as existing units.
    return {
      ...base,
      status: "empty",
      units: null,
      floors: null,
      totalFloorArea: null,
      confidence: "low",
      detail: `נמצא היתר עתידי (${anyTama ? "תמ\"א 38 / " : ""}${stages[0] ?? "בתהליך"}) — אין נתון על המצב הקיים`,
      raw: rawPayload,
    };
  } catch (e) {
    return { ...base, status: "error", errorMsg: e instanceof Error ? e.message : String(e) };
  }
}

// ───────────────────── Source 4: Heuristic ─────────────────────

function sourceHeuristic(plotArea: number | null): Omit<SourceResult, "durationMs"> {
  // Estimate floors from plot size: small plots → 3 floors; large plots → up to 8.
  const area = plotArea ?? 500;
  const floors = Math.min(8, Math.max(3, Math.round(area / 200)));
  // Footprint ratio: smaller plots typically have higher coverage (~50%), larger ~35%.
  const coverage = area < 400 ? 0.5 : area < 800 ? 0.45 : 0.4;
  const footprint = area * coverage;
  const totalFloorArea = footprint * floors;
  const units = Math.max(1, Math.round(totalFloorArea / AVG_UNIT_AREA));
  return {
    source: "heuristic",
    units,
    floors,
    totalFloorArea,
    confidence: "very_low",
    status: "ok",
    label: "הערכה היוריסטית",
    detail: `שטח ${area}מ"ר × ${Math.round(coverage * 100)}% × ${floors} קומות ÷ ${AVG_UNIT_AREA} מ"ר`,
  };
}

// ─────────────────────────── Aggregator ────────────────────────

function pickBest(sources: SourceResult[]): SourceResult {
  // Priority by reliability:
  // manual → nadlan → govmap_bldg → heuristic
  // Note: tlv_permits is intentionally excluded from units selection
  // (still runs for diagnostics and appears in sources_json).
  const manual = sources.find((s) => s.source === "manual" && s.status === "ok" && s.units !== null);
  if (manual) return manual;

  const nadlan = sources.find((s) => s.source === "nadlan" && s.status === "ok" && s.units !== null);
  if (nadlan) return nadlan;

  const bldg = sources.find((s) => s.source === "govmap_bldg" && s.status === "ok" && s.units !== null);
  if (bldg) return bldg;

  const heur = sources.find((s) => s.source === "heuristic" && s.status === "ok" && s.units !== null);
  if (heur) return heur;

  return sources[sources.length - 1];
}

// Floors are picked separately: GovMap BUILDINGS layer is the only source
// that returns a *physically measured* floor count (`hasRealFloors`). Even
// the TLV permits layer doesn't expose floors. So priority for floors is:
//   manual → govmap_bldg (with real floors) → nadlan (derived from deals)
//   → govmap_bldg (estimated) → heuristic
function pickBestFloors(sources: SourceResult[]): SourceResult | null {
  const manual = sources.find((s) => s.source === "manual" && s.status === "ok" && s.floors !== null);
  if (manual) return manual;

  const bldgReal = sources.find((s) => {
    if (s.source !== "govmap_bldg" || s.status !== "ok" || s.floors === null) return false;
    const raw = s.raw as { hasRealFloors?: boolean } | undefined;
    return raw?.hasRealFloors === true;
  });
  if (bldgReal) return bldgReal;

  const nadlanFloors = sources.find((s) => s.source === "nadlan" && s.status === "ok" && s.floors !== null);
  if (nadlanFloors) return nadlanFloors;

  const bldgAny = sources.find((s) => s.source === "govmap_bldg" && s.status === "ok" && s.floors !== null);
  if (bldgAny) return bldgAny;

  const heur = sources.find((s) => s.source === "heuristic" && s.floors !== null);
  if (heur) return heur;

  return null;
}

// Built-area picker: manual > GovMap (real floors) > GovMap estimate > heuristic.
// Note: tlv_permits & nadlan are intentionally excluded from built-area
// selection (they still contribute to units/floors and appear in sources_json
// for diagnostics).
function pickBestBuiltArea(sources: SourceResult[]): SourceResult | null {
  const manual = sources.find((s) => s.source === "manual" && s.status === "ok" && s.totalFloorArea !== null && s.totalFloorArea > 0);
  if (manual) return manual;

  const bldgReal = sources.find((s) => {
    if (s.source !== "govmap_bldg" || s.status !== "ok" || !s.totalFloorArea) return false;
    const raw = s.raw as { hasRealFloors?: boolean } | undefined;
    return raw?.hasRealFloors === true;
  });
  if (bldgReal) return bldgReal;

  const bldgAny = sources.find((s) => s.source === "govmap_bldg" && s.status === "ok" && s.totalFloorArea);
  if (bldgAny) return bldgAny;

  const heur = sources.find((s) => s.source === "heuristic" && s.totalFloorArea);
  if (heur) return heur;

  return null;
}

// ────────────────────────── HTTP handler ───────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as RequestBody;
    if (!body?.gush || !body?.helka) {
      return new Response(JSON.stringify({ error: "missing gush/helka" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Manual override → upsert and return immediately
    if (typeof body.manualUnits === "number" && body.manualUnits > 0) {
      const manualSource: SourceResult = {
        source: "manual",
        units: body.manualUnits,
        floors: body.manualFloors ?? null,
        totalFloorArea: body.manualBuiltArea ?? null,
        confidence: "high",
        status: "ok",
        label: "מאומת ידנית",
        detail: "הוזן ע״י המשתמש",
        durationMs: 0,
      };
      const payload = {
        gush: body.gush,
        helka: body.helka,
        existing_units: body.manualUnits,
        existing_floors: body.manualFloors ?? null,
        source: "manual",
        notes: body.manualNotes ?? null,
        sources_json: [manualSource],
        confidence: "high",
        built_area: body.manualBuiltArea ?? null,
        built_area_source: body.manualBuiltArea ? "manual" : null,
        built_area_confidence: body.manualBuiltArea ? "high" : null,
        last_refreshed_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("plot_units_cache")
        .upsert(payload, { onConflict: "gush,helka" });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          units: body.manualUnits,
          floors: body.manualFloors ?? null,
          source: "manual",
          confidence: "high",
          builtArea: body.manualBuiltArea ?? null,
          builtAreaSource: body.manualBuiltArea ? "manual" : null,
          builtAreaConfidence: body.manualBuiltArea ? "high" : null,
          sources: [manualSource],
          cached: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cache lookup (unless refresh forced)
    if (!body.refresh) {
      const { data: cached } = await supabase
        .from("plot_units_cache")
        .select(
          "existing_units, existing_floors, source, building_count, total_floor_area, built_area, built_area_source, built_area_confidence, notes, sources_json, confidence, last_refreshed_at",
        )
        .eq("gush", body.gush)
        .eq("helka", body.helka)
        .maybeSingle();

      if (cached) {
        // Skip stale low-quality cache from earlier logic versions; recompute.
        const isStale =
          cached.source === "estimate" ||
          cached.source === "heuristic" ||
          !cached.confidence ||
          cached.confidence === "very_low";
        if (!isStale) {
          const cachedSources = (cached.sources_json ?? []) as SourceResult[];
          const cachedFloorsBest = Array.isArray(cachedSources) ? pickBestFloors(cachedSources) : null;
          const cachedAreaBest = Array.isArray(cachedSources) ? pickBestBuiltArea(cachedSources) : null;
          return new Response(
            JSON.stringify({
              units: cached.existing_units,
              floors: cached.existing_floors,
              source: cached.source,
              confidence: cached.confidence ?? null,
              floorsSource: cachedFloorsBest?.source ?? null,
              floorsConfidence: cachedFloorsBest?.confidence ?? null,
              buildingCount: cached.building_count,
              totalFloorArea: cached.total_floor_area,
              builtArea: cached.built_area ?? cachedAreaBest?.totalFloorArea ?? null,
              builtAreaSource: cached.built_area_source ?? cachedAreaBest?.source ?? null,
              builtAreaConfidence: cached.built_area_confidence ?? cachedAreaBest?.confidence ?? null,
              notes: cached.notes,
              sources: cachedSources,
              lastRefreshedAt: cached.last_refreshed_at,
              cached: true,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // ── Run all sources ──
    const centroidItm = await getParcelCentroidItm(body.gush, body.helka);
    const centroidWm = centroidItm ? itmToWebMercator(centroidItm.x, centroidItm.y) : null;

    const [nadlan, bldg, tlv] = await Promise.all([
      timed(() => sourceNadlan(body.gush, body.helka, centroidWm)),
      timed(() => sourceGovmapBldg(body.gush, body.helka, body.plotArea ?? null, centroidItm)),
      timed(() => sourceTlvPermits(centroidItm)),
    ]);
    const heur = sourceHeuristic(body.plotArea ?? null);

    const sources: SourceResult[] = [
      { ...tlv.value, durationMs: tlv.ms },
      { ...nadlan.value, durationMs: nadlan.ms },
      { ...bldg.value, durationMs: bldg.ms },
      { ...heur, durationMs: 0 },
    ];

    const best = pickBest(sources);
    const bestFloors = pickBestFloors(sources);
    const bestArea = pickBestBuiltArea(sources);
    const chosenFloors = bestFloors?.floors ?? best.floors;
    const chosenArea = bestArea?.totalFloorArea ?? best.totalFloorArea ?? null;

    // Cache (best-effort)
    const { error: upsertErr } = await supabase
      .from("plot_units_cache")
      .upsert(
        {
          gush: body.gush,
          helka: body.helka,
          existing_units: best.units,
          existing_floors: chosenFloors,
          source: best.source,
          building_count: bldg.value.raw && typeof bldg.value.raw === "object"
            ? ((bldg.value.raw as { buildings?: unknown[] }).buildings?.length ?? 0)
            : 0,
          total_floor_area: best.totalFloorArea,
          built_area: chosenArea,
          built_area_source: bestArea?.source ?? null,
          built_area_confidence: bestArea?.confidence ?? null,
          sources_json: sources,
          confidence: best.confidence,
          last_refreshed_at: new Date().toISOString(),
        },
        { onConflict: "gush,helka" },
      );
    if (upsertErr) console.error("cache upsert failed", upsertErr);

    return new Response(
      JSON.stringify({
        units: best.units,
        floors: chosenFloors,
        source: best.source,
        confidence: best.confidence,
        floorsSource: bestFloors?.source ?? null,
        floorsConfidence: bestFloors?.confidence ?? null,
        builtArea: chosenArea,
        builtAreaSource: bestArea?.source ?? null,
        builtAreaConfidence: bestArea?.confidence ?? null,
        sources,
        centroid: centroidItm
          ? { x: centroidItm.x, y: centroidItm.y, via: centroidItm.via }
          : null,
        cached: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("lookup-plot-units error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
