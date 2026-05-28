// Pure deterministic financial engine for Israeli real-estate feasibility.
// No AI. Same input -> same output.

export type ProjectType = "urban_renewal" | "new_construction" | "combination";
export type RenewalSubtype = "tama38" | "pinui_binui";
export type FinishLevel = "standard" | "premium" | "luxury";
// full_rebuild = הריסה + בנייה מחדש על כל השטח (תמ"א 38/2, פינוי-בינוי, בנייה חדשה)
// addition_only = חיזוק קיים + תוספת בלבד (תמ"א 38/1)
export type ConstructionMode = "full_rebuild" | "addition_only";

export interface ZoningConstraints {
  treesForConservation?: number | null;
  parkingStandardPerUnit?: number | null;
  requiredBasementFloors?: number | null;
  todReliefApplies?: boolean | null;
  dewateringRequired?: boolean | null;
}

export interface EngineInput {
  // project
  projectType: ProjectType;
  renewalSubtype?: RenewalSubtype;
  developerLandSharePct?: number; // 0-100, only for combination

  // plot & planning (from FeasibilityReport)
  plotArea: number;
  existingBuiltAreaSqm: number;
  proposedBuiltAreaSqm: number;
  proposedFloors?: number; // for height premium
  estimatedSellableArea: number;     // gross sellable above-ground residential area (BEFORE deducting owners' return)
  proposedUnits: number;
  existingUnits?: number;            // # apartments before redevelopment (urban renewal)
  zoning?: ZoningConstraints;

  // ─── urban-renewal owners' return ───
  // Apartments given back to existing owners do NOT generate sales revenue.
  // Provide either an explicit area, OR let the engine derive it from existingUnits + bonus.
  ownersReturnAreaSqm?: number;          // explicit override (m²); takes precedence
  ownersReturnBonusPerUnitSqm?: number;  // bonus per returned apt; default 25 (תמ"א 38/2) / 12 (פינוי-בינוי)
  minOwnerUnitSizeSqm?: number;          // floor on per-owner unit size (default 80)

  // financial inputs
  avgSalePricePerSqm: number;
  buildCostPerSqm: number;        // base above-ground residential rate (₪/m²)
  softCostsPct: number;
  vatPct: number;
  equity: number;
  loanInterestPct: number;
  constructionMonths: number;
  tenantRentPerMonth: number;
  tenantEvacuationCost: number;
  targetDeveloperProfitPct: number;
  landValuePerSqm: number;
  bettermentTaxPct: number;

  // ─── construction-cost refinements (all optional, sensible defaults) ───
  finishLevel?: FinishLevel;              // default "standard"
  basementCostMultiplier?: number;        // default 0.70 (basement vs above-ground)
  basementAreaPerFloorRatio?: number;     // default 0.85 (of plot area)
  demolitionCostPerSqm?: number;          // default 400 ₪/m² (urban renewal full_rebuild only)
  siteDevelopmentCostPerSqmPlot?: number; // default 450 ₪/m² of plot
  escalationPctPerYear?: number;          // default 3% — construction inflation
  contingencyPct?: number;                // default 5% — בלת"מ on hard cost

  // ─── construction mode (delta-area vs full rebuild) ───
  constructionMode?: ConstructionMode;    // default depends on projectType+subtype
  strengtheningCostPerSqm?: number;       // default 3,000 ₪/m² (for addition_only only)

  // ─── revenue detail (optional; if provided, replaces avgPrice × area) ───
  revenue?: RevenueParams;
}

export type UnitType = "studio" | "2room" | "3room" | "4room" | "5room" | "penthouse" | "garden";

export interface UnitMixRow {
  type: UnitType;
  count: number;
  avgSizeSqm: number;
  pricePerSqm: number;
}

export interface RevenueParams {
  unitMix: UnitMixRow[];
  floorPremiumPctPerFloor?: number;
  penthousePremiumPct?: number;
  storageUnitsCount?: number;
  storagePricePerUnit?: number;
  extraParkingCount?: number;
  extraParkingPricePerUnit?: number;
  commercialAreaSqm?: number;
  commercialPricePerSqm?: number;
  marketingDiscountPct?: number;
  brokerageFeePct?: number;
  absorptionRatePerMonth?: number;
  priceEscalationPctPerYear?: number;
}

export interface UnitMixBreakdownRow {
  type: UnitType;
  label: string;
  count: number;
  avgSizeSqm: number;
  pricePerSqm: number;
  basePrice: number;
  premiumPct: number;
  totalRevenue: number;
}

export interface AncillaryRevenueRow {
  label: string;
  detail: string;
  total: number;
}

export interface RevenueBreakdown {
  unitMixRows: UnitMixBreakdownRow[];
  unitMixTotal: number;
  ancillaryRows: AncillaryRevenueRow[];
  ancillaryTotal: number;
  grossRevenue: number;
  salesDurationMonths: number;
  escalationMultiplier: number;
  escalationUplift: number;
  escalatedRevenue: number;
  marketingDiscountPct: number;
  marketingDiscount: number;
  brokerageFeePct: number;
  brokerageFee: number;
  netRevenueToDeveloper: number;
}

export interface SensitivityCell {
  priceDelta: number;
  costDelta: number;
  profit: number;
  roc: number;
}

export interface MonthlyCashflowRow {
  month: number;
  inflow: number;
  outflow: number;
  net: number;
  debtBalance: number;
}

export interface ConstructionBreakdown {
  constructionMode: ConstructionMode;
  existingBuiltAreaSqm: number;
  addedBuiltAreaSqm: number;              // proposed - existing (≥0)
  aboveGroundAreaSqm: number;             // area priced at new-build rate
  basementAreaSqm: number;
  effectiveAboveGroundRate: number;       // ₪/m² after finish + height premium
  effectiveBasementRate: number;          // ₪/m²
  aboveGroundCost: number;
  basementCost: number;
  strengtheningCost: number;              // existing × strengtheningCostPerSqm (addition_only)
  strengtheningCostPerSqm: number;
  finishLevel: FinishLevel;
  finishMultiplier: number;
  heightPremiumMultiplier: number;
  floorsAboveGround: number;
  demolitionCost: number;
  siteDevelopmentCost: number;
  baseHardCost: number;
  escalationMultiplier: number;
  escalationCost: number;
  contingencyPct: number;
  contingencyCost: number;
  totalHardCost: number;
  effectiveCostPerSqmBuilt: number;       // totalHardCost / proposedBuiltAreaSqm
}

export interface EngineReport {
  // revenue
  totalSalesRevenue: number;
  netSalesRevenue: number;
  grossSellableAreaSqm: number;
  ownersReturnAreaSqm: number;
  netSellableAreaForSaleSqm: number;
  ownersReturnUnits: number;
  avgOwnerUnitSizeSqm: number;
  revenueBreakdown?: RevenueBreakdown;
  // costs
  hardCosts: number;
  constructionBreakdown: ConstructionBreakdown;
  softCosts: number;
  tenantCosts: number;
  bettermentTax: number;
  permitFees: number;
  landCost: number;
  financingCosts: number;
  treePreservationCost: number;
  parkingBasementCost: number;
  dewateringCost: number;
  physicalConstraintsCost: number;
  totalProjectCost: number;
  // profitability
  developerProfit: number;
  rocPct: number;
  rosPct: number;
  irrPct: number;
  breakevenPricePerSqm: number;
  // assessment
  verdict: "profitable" | "marginal" | "loss";
  verdictLabel: string;
  headline: string;
  targetProfitPct: number;
  // detail
  sensitivity: SensitivityCell[];
  monthlyCashflow: MonthlyCashflowRow[];
  notes: string[];
}

// ───────── helpers ─────────

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Logistic S-curve cumulative spend (0..1) at month m given total months T.
// Steeper middle, slow start/end. 60% in mid-half.
function sCurveCumulative(m: number, T: number): number {
  if (T <= 0) return m >= 0 ? 1 : 0;
  if (m <= 0) return 0;
  if (m >= T) return 1;
  const x = m / T;
  const k = 6;
  // logistic, normalized so cum(0)=0 cum(1)=1
  const raw = (t: number) => 1 / (1 + Math.exp(-k * (t - 0.5)));
  const rMin = raw(0);
  const rMax = raw(1);
  return (raw(x) - rMin) / (rMax - rMin);
}

// ───────── component calculators ─────────

export function computeRevenues(input: EngineInput) {
  // ─── Hardening: clamp inputs so a single bad value can't flip the model ───
  const grossSellableAreaSqm = Math.max(0, Number(input.estimatedSellableArea) || 0);
  const pricePerSqm = Math.max(0, Number(input.avgSalePricePerSqm) || 0);
  const vatPct = clamp(Number(input.vatPct) || 0, 0, 100);

  // ─── Owners' return (only in urban renewal) ───
  // Apartments returned to existing owners (תמ"א 38/2 / פינוי-בינוי) are NOT sold.
  // Their floor area must be deducted from the gross sellable area before revenue.
  let ownersReturnAreaSqm = 0;
  let ownersReturnUnits = 0;
  let avgOwnerUnitSizeSqm = 0;

  if (input.projectType === "urban_renewal") {
    const existingUnits = Math.max(
      0,
      Math.round(
        input.existingUnits ??
          // fallback proxy: assume ~85 m² per existing apt if caller didn't pass units
          (input.existingBuiltAreaSqm > 0 ? input.existingBuiltAreaSqm / 85 : 0),
      ),
    );
    ownersReturnUnits = existingUnits;

    if (
      input.ownersReturnAreaSqm != null &&
      Number.isFinite(input.ownersReturnAreaSqm) &&
      input.ownersReturnAreaSqm >= 0
    ) {
      // explicit override
      ownersReturnAreaSqm = input.ownersReturnAreaSqm;
      avgOwnerUnitSizeSqm = existingUnits > 0 ? ownersReturnAreaSqm / existingUnits : 0;
    } else if (existingUnits > 0) {
      // Derived: existing apartment size + statutory bonus per unit, floored.
      // Default bonus: 25 m² for תמ"א 38/2, 12 m² for פינוי-בינוי (typical industry assumptions).
      const defaultBonus = input.renewalSubtype === "pinui_binui" ? 12 : 25;
      const bonusPerUnit = clamp(
        Number(input.ownersReturnBonusPerUnitSqm ?? defaultBonus),
        0,
        80,
      );
      const minOwnerUnitSize = clamp(
        Number(input.minOwnerUnitSizeSqm ?? 80),
        40,
        200,
      );
      const existingAvg = input.existingBuiltAreaSqm > 0
        ? input.existingBuiltAreaSqm / existingUnits
        : minOwnerUnitSize;
      avgOwnerUnitSizeSqm = Math.max(minOwnerUnitSize, existingAvg) + bonusPerUnit;
      ownersReturnAreaSqm = existingUnits * avgOwnerUnitSizeSqm;
    }

    // Safety cap: owners' return can't exceed the gross sellable area
    // (if it does, planning is infeasible — clamp to gross so revenue = 0, never negative).
    if (ownersReturnAreaSqm > grossSellableAreaSqm) {
      ownersReturnAreaSqm = grossSellableAreaSqm;
    }
  }

  const netSellableAreaForSaleSqm = Math.max(0, grossSellableAreaSqm - ownersReturnAreaSqm);

  // ─── Detailed revenue path (if revenue params provided) ───
  if (input.revenue?.unitMix && input.revenue.unitMix.length > 0) {
    const detailed = computeDetailedRevenue(input, pricePerSqm);
    return {
      totalSalesRevenue: detailed.netRevenueToDeveloper,
      netSalesRevenue: detailed.netRevenueToDeveloper / (1 + vatPct / 100),
      grossSellableAreaSqm,
      ownersReturnAreaSqm,
      netSellableAreaForSaleSqm,
      ownersReturnUnits,
      avgOwnerUnitSizeSqm,
      revenueBreakdown: detailed,
    };
  }

  // ─── Simple path (fallback): avgPrice × area ───
  const totalSalesRevenue = netSellableAreaForSaleSqm * pricePerSqm;
  const netSalesRevenue = totalSalesRevenue / (1 + vatPct / 100);

  return {
    totalSalesRevenue,
    netSalesRevenue,
    grossSellableAreaSqm,
    ownersReturnAreaSqm,
    netSellableAreaForSaleSqm,
    ownersReturnUnits,
    avgOwnerUnitSizeSqm,
    revenueBreakdown: undefined as RevenueBreakdown | undefined,
  };
}

const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  studio: "סטודיו",
  "2room": "2 חדרים",
  "3room": "3 חדרים",
  "4room": "4 חדרים",
  "5room": "5 חדרים",
  penthouse: "פנטהאוז",
  garden: "דירת גן",
};

function computeDetailedRevenue(input: EngineInput, fallbackPricePerSqm: number): RevenueBreakdown {
  const r = input.revenue!;
  const floorPremiumPerFloor = clamp(Number(r.floorPremiumPctPerFloor ?? 0.8), 0, 5) / 100;
  const penthousePremium = clamp(Number(r.penthousePremiumPct ?? 25), 0, 100) / 100;
  const floors = Math.max(1, Number(input.proposedFloors ?? 1));
  // Average floor premium across the building (floor 1..N → avg ≈ (N-1)/2 floors above ground floor)
  const avgFloorPremium = floorPremiumPerFloor * ((floors - 1) / 2);

  const unitMixRows: UnitMixBreakdownRow[] = r.unitMix.map((row) => {
    const count = Math.max(0, Math.round(Number(row.count) || 0));
    const size = Math.max(0, Number(row.avgSizeSqm) || 0);
    const price = Math.max(0, Number(row.pricePerSqm) || fallbackPricePerSqm);
    const basePrice = count * size * price;
    const typePremium = row.type === "penthouse" ? penthousePremium : 0;
    const premiumPct = typePremium + avgFloorPremium;
    const totalRevenue = basePrice * (1 + premiumPct);
    return {
      type: row.type,
      label: UNIT_TYPE_LABEL[row.type],
      count,
      avgSizeSqm: size,
      pricePerSqm: Math.round(price),
      basePrice: Math.round(basePrice),
      premiumPct: Number(premiumPct.toFixed(4)),
      totalRevenue: Math.round(totalRevenue),
    };
  });
  const unitMixTotal = unitMixRows.reduce((a, x) => a + x.totalRevenue, 0);

  // Ancillary
  const ancillaryRows: AncillaryRevenueRow[] = [];
  const storageCount = Math.max(0, Math.round(Number(r.storageUnitsCount ?? 0)));
  const storagePrice = Math.max(0, Number(r.storagePricePerUnit ?? 25_000));
  if (storageCount > 0 && storagePrice > 0) {
    ancillaryRows.push({
      label: "מחסנים",
      detail: `${storageCount} × ${storagePrice.toLocaleString("he-IL")} ₪`,
      total: storageCount * storagePrice,
    });
  }
  const parkingCount = Math.max(0, Math.round(Number(r.extraParkingCount ?? 0)));
  const parkingPrice = Math.max(0, Number(r.extraParkingPricePerUnit ?? 120_000));
  if (parkingCount > 0 && parkingPrice > 0) {
    ancillaryRows.push({
      label: "חניות עודפות",
      detail: `${parkingCount} × ${parkingPrice.toLocaleString("he-IL")} ₪`,
      total: parkingCount * parkingPrice,
    });
  }
  const commercialArea = Math.max(0, Number(r.commercialAreaSqm ?? 0));
  const commercialPrice = Math.max(0, Number(r.commercialPricePerSqm ?? 0));
  if (commercialArea > 0 && commercialPrice > 0) {
    ancillaryRows.push({
      label: "שטחי מסחר",
      detail: `${commercialArea.toLocaleString("he-IL")} מ״ר × ${commercialPrice.toLocaleString("he-IL")} ₪`,
      total: commercialArea * commercialPrice,
    });
  }
  const ancillaryTotal = ancillaryRows.reduce((a, x) => a + x.total, 0);

  const grossRevenue = unitMixTotal + ancillaryTotal;

  // Sales duration & escalation
  const totalSaleUnits = unitMixRows.reduce((a, x) => a + x.count, 0);
  const absorption = Math.max(0.5, Number(r.absorptionRatePerMonth ?? 4));
  const salesDurationMonths = totalSaleUnits > 0 ? totalSaleUnits / absorption : 0;
  const escPct = clamp(Number(r.priceEscalationPctPerYear ?? 3), 0, 25) / 100;
  // Midpoint inflation: average sale occurs at salesDurationMonths/2
  const escalationMultiplier = Math.pow(1 + escPct, salesDurationMonths / 24);
  const escalatedRevenue = grossRevenue * escalationMultiplier;
  const escalationUplift = escalatedRevenue - grossRevenue;

  // Marketing & brokerage (revenue reducers)
  const marketingPct = clamp(Number(r.marketingDiscountPct ?? 2), 0, 30) / 100;
  const marketingDiscount = escalatedRevenue * marketingPct;
  const afterDiscount = escalatedRevenue - marketingDiscount;
  const brokeragePct = clamp(Number(r.brokerageFeePct ?? 2), 0, 10) / 100;
  const brokerageFee = afterDiscount * brokeragePct;
  const netRevenueToDeveloper = afterDiscount - brokerageFee;

  return {
    unitMixRows,
    unitMixTotal: Math.round(unitMixTotal),
    ancillaryRows: ancillaryRows.map((x) => ({ ...x, total: Math.round(x.total) })),
    ancillaryTotal: Math.round(ancillaryTotal),
    grossRevenue: Math.round(grossRevenue),
    salesDurationMonths: Number(salesDurationMonths.toFixed(1)),
    escalationMultiplier: Number(escalationMultiplier.toFixed(4)),
    escalationUplift: Math.round(escalationUplift),
    escalatedRevenue: Math.round(escalatedRevenue),
    marketingDiscountPct: Number((marketingPct * 100).toFixed(2)),
    marketingDiscount: Math.round(marketingDiscount),
    brokerageFeePct: Number((brokeragePct * 100).toFixed(2)),
    brokerageFee: Math.round(brokerageFee),
    netRevenueToDeveloper: Math.round(netRevenueToDeveloper),
  };
}


// ───────── Construction cost (detailed) ─────────
//
// Methodology:
//   1. Split proposed built area into above-ground vs basement parking
//      (basementAreaPerFloor = basementAreaPerFloorRatio × plotArea).
//   2. Above-ground rate = buildCostPerSqm × finishMultiplier × heightPremiumMultiplier
//      Basement rate     = buildCostPerSqm × basementCostMultiplier   (no finishes; no height premium)
//   3. Demolition (urban renewal only) = existingBuiltAreaSqm × demolitionCostPerSqm.
//   4. Site development = plotArea × siteDevelopmentCostPerSqmPlot.
//   5. Escalation: midpoint inflation (1+esc)^(months/24) applied to baseHardCost.
//   6. Contingency (בלת"מ): contingencyPct on (base + escalation).
//   7. Soft costs = softCostsPct × totalHardCost (after escalation+contingency).
//   8. Permit fees ≈ 1% of totalHardCost.

const FINISH_MULTIPLIER: Record<FinishLevel, number> = {
  standard: 1.0,
  premium: 1.15,
  luxury: 1.30,
};

// Height premium: above 9 floors logistics/crane/scaffolding rise.
// +1% per floor in 10..24, +2% per floor 25..40. Cap +35%.
function heightPremiumMultiplier(floors: number): number {
  if (!floors || floors <= 9) return 1.0;
  let extra = 0;
  const tier1 = Math.min(floors, 24) - 9;        // floors 10..24
  extra += Math.max(0, tier1) * 0.01;
  const tier2 = Math.max(0, Math.min(floors, 40) - 24); // 25..40
  extra += tier2 * 0.02;
  return 1 + Math.min(0.35, extra);
}

export function computeConstructionCost(input: EngineInput): ConstructionBreakdown {
  const finishLevel = input.finishLevel ?? "standard";
  const finishMul = FINISH_MULTIPLIER[finishLevel];

  // Construction mode default:
  //   - urban_renewal + tama38 → addition_only (חיזוק + תוספת)
  //   - all other cases       → full_rebuild
  const mode: ConstructionMode = input.constructionMode ??
    (input.projectType === "urban_renewal" && input.renewalSubtype === "tama38"
      ? "addition_only"
      : "full_rebuild");

  // Delta area added vs existing (never negative)
  const addedBuiltAreaSqm = Math.max(
    0,
    input.proposedBuiltAreaSqm - input.existingBuiltAreaSqm,
  );

  // Basement area: ratio × plot × required basement floors
  // (new underground parking — built in both modes, additive to above-ground built area)
  const basementFloors = Math.max(0, input.zoning?.requiredBasementFloors ?? 1);
  const basementRatio = clamp(input.basementAreaPerFloorRatio ?? 0.85, 0.5, 1.0);
  const basementAreaSqm = basementFloors * basementRatio * input.plotArea;

  // Above-ground area priced at full new-build rate.
  // NOTE: `proposedBuiltAreaSqm` represents the planned ABOVE-GROUND built area
  // (שטחים עיקריים + שירות מעל הקרקע), and does NOT include basement parking.
  // Basements are priced separately and added on top — never subtracted from above-ground.
  //   full_rebuild  → entire proposed above-ground built area
  //   addition_only → only the added above-ground area (delta vs existing);
  //                   the existing area is priced at the strengthening rate below.
  const aboveGroundAreaSqm = mode === "full_rebuild"
    ? input.proposedBuiltAreaSqm
    : addedBuiltAreaSqm;

  // Floors above ground — fallback proxy if not provided
  const floorsAG = input.proposedFloors ??
    Math.max(1, Math.round(
      input.proposedBuiltAreaSqm / Math.max(1, input.plotArea * 0.55),
    ));
  const heightMul = heightPremiumMultiplier(floorsAG);

  const effectiveAboveGroundRate = input.buildCostPerSqm * finishMul * heightMul;
  const basementMul = clamp(input.basementCostMultiplier ?? 0.70, 0.4, 1.2);
  const effectiveBasementRate = input.buildCostPerSqm * basementMul;

  const aboveGroundCost = aboveGroundAreaSqm * effectiveAboveGroundRate;
  const basementCost = basementAreaSqm * effectiveBasementRate;

  // Strengthening of existing structure (addition_only mode only)
  const strengtheningRate = mode === "addition_only"
    ? Math.max(0, input.strengtheningCostPerSqm ?? 3_000)
    : 0;
  const strengtheningCost = mode === "addition_only"
    ? input.existingBuiltAreaSqm * strengtheningRate
    : 0;

  // Demolition only when fully rebuilding in urban renewal
  const demolitionCost = (mode === "full_rebuild" && input.projectType === "urban_renewal")
    ? input.existingBuiltAreaSqm * (input.demolitionCostPerSqm ?? 400)
    : 0;

  const siteDevelopmentCost =
    input.plotArea * (input.siteDevelopmentCostPerSqmPlot ?? 450);

  const baseHardCost =
    aboveGroundCost + basementCost + strengtheningCost + demolitionCost + siteDevelopmentCost;

  // Midpoint escalation
  const escPct = clamp(input.escalationPctPerYear ?? 3, 0, 25) / 100;
  const escalationMultiplier = Math.pow(1 + escPct, input.constructionMonths / 24);
  const escalatedCost = baseHardCost * escalationMultiplier;
  const escalationCost = escalatedCost - baseHardCost;

  // Contingency
  const contingencyPct = clamp(input.contingencyPct ?? 5, 0, 25);
  const contingencyCost = escalatedCost * (contingencyPct / 100);

  const totalHardCost = escalatedCost + contingencyCost;
  const effectiveCostPerSqmBuilt = input.proposedBuiltAreaSqm > 0
    ? totalHardCost / input.proposedBuiltAreaSqm
    : 0;

  return {
    constructionMode: mode,
    existingBuiltAreaSqm: Math.round(input.existingBuiltAreaSqm),
    addedBuiltAreaSqm: Math.round(addedBuiltAreaSqm),
    aboveGroundAreaSqm: Math.round(aboveGroundAreaSqm),
    basementAreaSqm: Math.round(basementAreaSqm),
    effectiveAboveGroundRate: Math.round(effectiveAboveGroundRate),
    effectiveBasementRate: Math.round(effectiveBasementRate),
    aboveGroundCost: Math.round(aboveGroundCost),
    basementCost: Math.round(basementCost),
    strengtheningCost: Math.round(strengtheningCost),
    strengtheningCostPerSqm: Math.round(strengtheningRate),
    finishLevel,
    finishMultiplier: finishMul,
    heightPremiumMultiplier: Number(heightMul.toFixed(3)),
    floorsAboveGround: floorsAG,
    demolitionCost: Math.round(demolitionCost),
    siteDevelopmentCost: Math.round(siteDevelopmentCost),
    baseHardCost: Math.round(baseHardCost),
    escalationMultiplier: Number(escalationMultiplier.toFixed(4)),
    escalationCost: Math.round(escalationCost),
    contingencyPct,
    contingencyCost: Math.round(contingencyCost),
    totalHardCost: Math.round(totalHardCost),
    effectiveCostPerSqmBuilt: Math.round(effectiveCostPerSqmBuilt),
  };
}

export function computeHardSoft(input: EngineInput) {
  const breakdown = computeConstructionCost(input);
  const hardCosts = breakdown.totalHardCost;
  const softCosts = hardCosts * (input.softCostsPct / 100);
  const permitFees = hardCosts * 0.01;
  return { hardCosts, softCosts, permitFees, breakdown };
}

export function computeLandCost(input: EngineInput): number {
  if (input.projectType === "urban_renewal") return 0;
  if (input.projectType === "new_construction") {
    return input.landValuePerSqm * input.plotArea;
  }
  const share = clamp(input.developerLandSharePct ?? 50, 0, 100) / 100;
  return input.landValuePerSqm * input.plotArea * share;
}

export function computeTenantCosts(input: EngineInput, hardCosts: number): number {
  if (input.projectType !== "urban_renewal") return 0;
  const existingUnits = Math.max(
    1,
    Math.round(
      input.existingUnits ?? (input.existingBuiltAreaSqm / 85), // prefer real count; fallback proxy
    ),
  );
  // Better: rely on planning.existing.units passed in -- but engine works from areas
  // The caller should pre-compute and pass effective existing units via a richer input if needed.
  const rentTotal =
    existingUnits * input.tenantRentPerMonth * input.constructionMonths;
  const evacTotal = existingUnits * input.tenantEvacuationCost;
  // legal + sale-law guarantees ~2.5% of hard
  const legalSaleGuarantee = hardCosts * 0.025;
  return rentTotal + evacTotal + legalSaleGuarantee;
}

export function computeBettermentTax(input: EngineInput): number {
  // urban renewal: full exemption under section 19 / pinui-binui law
  if (input.projectType === "urban_renewal") return 0;
  // Approximate uplift = uplift in land value driven by added rights.
  // uplift ≈ landValuePerSqm × (proposedBuilt − existingBuilt)
  const upliftSqm = Math.max(
    0,
    input.proposedBuiltAreaSqm - input.existingBuiltAreaSqm,
  );
  const uplift = input.landValuePerSqm * upliftSqm;
  // by law, betterment tax = 50% of uplift; user's bettermentTaxPct overrides that rate
  const rate = clamp(input.bettermentTaxPct, 0, 100) / 100;
  let tax = uplift * rate;
  if (input.projectType === "combination") {
    const share = clamp(input.developerLandSharePct ?? 50, 0, 100) / 100;
    tax *= share;
  }
  return tax;
}

export function computePhysicalConstraints(input: EngineInput) {
  const z = input.zoning ?? {};
  const treePreservationCost = (z.treesForConservation ?? 0) * 25_000;
  // NOTE: basement construction cost is already itemized inside computeConstructionCost
  // (by area × basement rate). We no longer add a per-unit basement charge here to
  // avoid double-counting. TOD relief is reflected separately if needed via a
  // reduction of the basement area input by the caller.
  const parkingBasementCost = 0;
  const requiredBasements = z.requiredBasementFloors ?? 1;
  const dewateringCost = z.dewateringRequired
    ? input.plotArea * requiredBasements * 350
    : 0;
  const physicalConstraintsCost =
    treePreservationCost + parkingBasementCost + dewateringCost;
  return {
    treePreservationCost,
    parkingBasementCost,
    dewateringCost,
    physicalConstraintsCost,
  };
}

// ───────── monthly cashflow + financing ─────────

interface CashflowResult {
  monthly: MonthlyCashflowRow[];
  financingCosts: number;
}

function buildMonthlyCashflow(
  input: EngineInput,
  costsExFinancing: number,
  netSalesRevenue: number,
): CashflowResult {
  const T = Math.max(1, Math.round(input.constructionMonths));
  const totalMonths = T + 3;
  const monthlyRate = input.loanInterestPct / 100 / 12;

  // sales: 40% presales linear from month 6..T, 60% delivery T+1..T+3
  const presaleStart = Math.min(6, T);
  const presaleMonths = Math.max(1, T - presaleStart + 1);
  const presaleTotal = netSalesRevenue * 0.4;
  const deliveryTotal = netSalesRevenue * 0.6;

  const rows: MonthlyCashflowRow[] = [];
  let debt = input.equity > 0 ? -input.equity : 0; // negative = cash on hand from equity
  let cumInterest = 0;

  for (let m = 0; m <= totalMonths; m++) {
    // outflow: S-curve over construction
    const prevC = sCurveCumulative(m - 1, T);
    const currC = sCurveCumulative(m, T);
    const outflow = m === 0 ? 0 : (currC - prevC) * costsExFinancing;

    // inflow
    let inflow = 0;
    if (m >= presaleStart && m <= T) inflow += presaleTotal / presaleMonths;
    if (m >= T + 1 && m <= T + 3) inflow += deliveryTotal / 3;

    // update debt: positive debt accrues interest
    if (debt > 0) {
      const interest = debt * monthlyRate;
      cumInterest += interest;
      debt += interest;
    }
    debt += outflow - inflow;

    rows.push({
      month: m,
      inflow: Math.round(inflow),
      outflow: Math.round(outflow),
      net: Math.round(inflow - outflow),
      debtBalance: Math.round(debt),
    });
  }

  return { monthly: rows, financingCosts: cumInterest };
}

// ───────── IRR (Newton-Raphson, bisection fallback) ─────────

export function computeIRR(monthly: MonthlyCashflowRow[], equity: number): number {
  // Equity-perspective cashflow: -equity at month 0, then monthly net.
  // Final month also returns remaining cash (close out debt).
  const cf: number[] = monthly.map((r) => r.net);
  cf[0] = (cf[0] ?? 0) - equity;
  // close out remaining debt at last month (refund of equity + profit)
  const last = monthly[monthly.length - 1];
  if (last) {
    cf[cf.length - 1] += -last.debtBalance; // negative debt = cash → positive inflow
  }

  const npv = (r: number) =>
    cf.reduce((acc, c, i) => acc + c / Math.pow(1 + r, i), 0);
  const dnpv = (r: number) =>
    cf.reduce((acc, c, i) => acc - (i * c) / Math.pow(1 + r, i + 1), 0);

  // Newton-Raphson
  let r = 0.01;
  for (let i = 0; i < 100; i++) {
    const v = npv(r);
    const d = dnpv(r);
    if (Math.abs(v) < 1) {
      return ((Math.pow(1 + r, 12) - 1) * 100);
    }
    if (Math.abs(d) < 1e-9) break;
    const next = r - v / d;
    if (!isFinite(next) || next <= -0.99 || next > 10) break;
    if (Math.abs(next - r) < 1e-8) {
      r = next;
      return ((Math.pow(1 + r, 12) - 1) * 100);
    }
    r = next;
  }

  // Bisection fallback
  let lo = -0.99;
  let hi = 5;
  let fLo = npv(lo);
  let fHi = npv(hi);
  if (fLo * fHi > 0) return 0; // no sign change → undefined; return 0
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1 || (hi - lo) < 1e-7) {
      return (Math.pow(1 + mid, 12) - 1) * 100;
    }
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return 0;
}

// ───────── breakeven (binary search on price) ─────────

export function computeBreakeven(input: EngineInput): number {
  let lo = 0;
  let hi = input.avgSalePricePerSqm * 3;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const trial = { ...input, avgSalePricePerSqm: mid };
    const r = coreAnalyze(trial, { recursive: true });
    if (r.developerProfit > 0) hi = mid;
    else lo = mid;
    if (hi - lo < 1) break;
  }
  return (lo + hi) / 2;
}

// ───────── sensitivity ─────────

export function computeSensitivity(input: EngineInput): SensitivityCell[] {
  const deltas = [-5, 0, 5];
  const cells: SensitivityCell[] = [];
  for (const pd of deltas) {
    for (const cd of deltas) {
      const trial: EngineInput = {
        ...input,
        avgSalePricePerSqm: input.avgSalePricePerSqm * (1 + pd / 100),
        buildCostPerSqm: input.buildCostPerSqm * (1 + cd / 100),
      };
      const r = coreAnalyze(trial, { recursive: true });
      cells.push({
        priceDelta: pd,
        costDelta: cd,
        profit: Math.round(r.developerProfit),
        roc: Number(r.rocPct.toFixed(2)),
      });
    }
  }
  return cells;
}

// ───────── core analyze (used by sensitivity & breakeven without recursion) ─────────

interface CoreOpts {
  recursive?: boolean;
}

function coreAnalyze(input: EngineInput, opts: CoreOpts = {}) {
  const rev = computeRevenues(input);
  const { totalSalesRevenue, netSalesRevenue } = rev;
  const { hardCosts, softCosts, permitFees, breakdown } = computeHardSoft(input);
  const landCost = computeLandCost(input);
  const tenantCosts = computeTenantCosts(input, hardCosts);
  const bettermentTax = computeBettermentTax(input);
  const phys = computePhysicalConstraints(input);

  const costsExFinancing =
    hardCosts +
    softCosts +
    permitFees +
    landCost +
    tenantCosts +
    bettermentTax +
    phys.physicalConstraintsCost;

  const { monthly, financingCosts } = buildMonthlyCashflow(
    input,
    costsExFinancing,
    netSalesRevenue,
  );

  const totalProjectCost = costsExFinancing + financingCosts;
  const developerProfit = netSalesRevenue - totalProjectCost;
  const rocPct = totalProjectCost > 0 ? (developerProfit / totalProjectCost) * 100 : 0;
  const rosPct = netSalesRevenue > 0 ? (developerProfit / netSalesRevenue) * 100 : 0;

  return {
    totalSalesRevenue,
    netSalesRevenue,
    grossSellableAreaSqm: rev.grossSellableAreaSqm,
    ownersReturnAreaSqm: rev.ownersReturnAreaSqm,
    netSellableAreaForSaleSqm: rev.netSellableAreaForSaleSqm,
    ownersReturnUnits: rev.ownersReturnUnits,
    avgOwnerUnitSizeSqm: rev.avgOwnerUnitSizeSqm,
    hardCosts,
    constructionBreakdown: breakdown,
    softCosts,
    permitFees,
    landCost,
    tenantCosts,
    bettermentTax,
    ...phys,
    financingCosts,
    totalProjectCost,
    developerProfit,
    rocPct,
    rosPct,
    monthly,
  };
}

// ───────── assemble full report ─────────

export function assembleReport(input: EngineInput): EngineReport {
  const core = coreAnalyze(input);
  const irrPct = computeIRR(core.monthly, input.equity);
  const breakevenPricePerSqm = computeBreakeven(input);
  const sensitivity = computeSensitivity(input);

  const target = input.targetDeveloperProfitPct;
  const verdict: "profitable" | "marginal" | "loss" =
    core.developerProfit < 0
      ? "loss"
      : core.rocPct >= target
      ? "profitable"
      : "marginal";
  const verdictLabel =
    verdict === "profitable" ? "רווחי" : verdict === "marginal" ? "שולי" : "הפסד";

  const notes: string[] = [];
  notes.push(
    `מנוע חישוב דטרמיניסטי v2 — תזרים חודשי ל-${core.monthly.length - 1} חודשים, IRR ב-Newton-Raphson.`,
  );
  const cb = core.constructionBreakdown;
  if (cb.constructionMode === "addition_only") {
    notes.push(
      `מצב בנייה: חיזוק + תוספת (תמ"א 38/1). שטח מתווסף ${cb.addedBuiltAreaSqm.toLocaleString("he-IL")} מ"ר בעלות בנייה חדשה, ` +
        `שטח קיים ${cb.existingBuiltAreaSqm.toLocaleString("he-IL")} מ"ר בחיזוק (${cb.strengtheningCostPerSqm.toLocaleString("he-IL")} ₪/מ"ר = ${cb.strengtheningCost.toLocaleString("he-IL")} ₪). ללא הריסה.`,
    );
  } else {
    notes.push(
      `מצב בנייה: הריסה ובנייה מחדש על מלוא השטח המוצע (${input.proposedBuiltAreaSqm.toLocaleString("he-IL")} מ"ר). שטח קיים ${input.existingBuiltAreaSqm.toLocaleString("he-IL")} מ"ר → הריסה.`,
    );
  }
  notes.push(
    `עלות בנייה בפועל: ${cb.effectiveCostPerSqmBuilt.toLocaleString("he-IL")} ₪/מ"ר ` +
      `(מעל-קרקע ${cb.aboveGroundAreaSqm.toLocaleString("he-IL")} מ"ר × ${cb.effectiveAboveGroundRate.toLocaleString("he-IL")} ₪, ` +
      `מרתפים ${cb.basementAreaSqm.toLocaleString("he-IL")} מ"ר × ${cb.effectiveBasementRate.toLocaleString("he-IL")} ₪).`,
  );
  if (cb.heightPremiumMultiplier > 1) {
    notes.push(
      `פרמיית גובה: ${cb.floorsAboveGround} קומות → +${((cb.heightPremiumMultiplier - 1) * 100).toFixed(1)}% על עלות מעל-קרקע.`,
    );
  }
  if (cb.finishMultiplier > 1) {
    notes.push(`רמת גמר "${cb.finishLevel}" → +${((cb.finishMultiplier - 1) * 100).toFixed(0)}%.`);
  }
  if (cb.demolitionCost > 0) {
    notes.push(`הריסה: ${cb.demolitionCost.toLocaleString("he-IL")} ₪.`);
  }
  notes.push(
    `אסקלציה (×${cb.escalationMultiplier.toFixed(3)}): ${cb.escalationCost.toLocaleString("he-IL")} ₪. ` +
      `בלת"מ ${cb.contingencyPct}%: ${cb.contingencyCost.toLocaleString("he-IL")} ₪.`,
  );
  if (input.projectType === "urban_renewal") {
    notes.push("✓ קרקע = 0 (התחדשות עירונית — בבעלות הדיירים).");
    notes.push(
      `✓ פטור מהיטל השבחה לפי ${input.renewalSubtype === "pinui_binui" ? "חוק פינוי-בינוי" : "סעיף 19 לתוספת השלישית (תמ\"א 38)"}.`,
    );
    notes.push("✓ נוספה עלות ערבויות חוק מכר + ליווי משפטי דיירים (2.5% מ-Hard).");
    if (core.ownersReturnAreaSqm > 0) {
      notes.push(
        `✓ נוכו ${core.ownersReturnUnits.toLocaleString("he-IL")} דירות לבעלי דירות קיימים ` +
          `(~${Math.round(core.avgOwnerUnitSizeSqm).toLocaleString("he-IL")} מ"ר/דירה, סה"כ ${Math.round(core.ownersReturnAreaSqm).toLocaleString("he-IL")} מ"ר) — ` +
          `שטח למכירה נטו: ${Math.round(core.netSellableAreaForSaleSqm).toLocaleString("he-IL")} מ"ר מתוך ${Math.round(core.grossSellableAreaSqm).toLocaleString("he-IL")} מ"ר.`,
      );
      if (core.netSellableAreaForSaleSqm <= 0) {
        notes.push("⚠ אזהרה: תוספת הזכויות אינה מספקת כיסוי לדירות התמורה — אין שטח למכירה.");
      }
    }
  } else if (input.projectType === "new_construction") {
    notes.push(`✓ שווי קרקע מלא: ${Math.round(core.landCost).toLocaleString("he-IL")} ₪.`);
    notes.push("✓ אין עלויות דיירים (קרקע פנויה).");
  } else {
    notes.push(
      `✓ עסקת קומבינציה — חלק היזם ${input.developerLandSharePct ?? 50}%: שווי קרקע משוקלל ${Math.round(core.landCost).toLocaleString("he-IL")} ₪.`,
    );
  }
  if (core.physicalConstraintsCost > 0) {
    notes.push(
      `אילוצים פיזיים: ${Math.round(core.physicalConstraintsCost).toLocaleString("he-IL")} ₪ (${((core.physicalConstraintsCost / core.totalProjectCost) * 100).toFixed(1)}% מהעלות).`,
    );
  }
  if (breakevenPricePerSqm > input.avgSalePricePerSqm * 0.95) {
    notes.push(
      `⚠ נקודת איזון (${Math.round(breakevenPricePerSqm).toLocaleString("he-IL")} ₪/מ"ר) קרובה למחיר השוק — שולי בטחון נמוכים.`,
    );
  }

  const headline =
    verdict === "profitable"
      ? `הפרויקט רווחי — ROC ${core.rocPct.toFixed(1)}% מעל היעד של ${target}%.`
      : verdict === "marginal"
      ? `הפרויקט שולי — ROC ${core.rocPct.toFixed(1)}% מתחת ליעד ${target}%.`
      : `הפרויקט מפסיד — גירעון ${Math.round(-core.developerProfit).toLocaleString("he-IL")} ₪.`;

  return {
    totalSalesRevenue: Math.round(core.totalSalesRevenue),
    netSalesRevenue: Math.round(core.netSalesRevenue),
    grossSellableAreaSqm: Math.round(core.grossSellableAreaSqm),
    ownersReturnAreaSqm: Math.round(core.ownersReturnAreaSqm),
    netSellableAreaForSaleSqm: Math.round(core.netSellableAreaForSaleSqm),
    ownersReturnUnits: core.ownersReturnUnits,
    avgOwnerUnitSizeSqm: Math.round(core.avgOwnerUnitSizeSqm),
    hardCosts: Math.round(core.hardCosts),
    constructionBreakdown: core.constructionBreakdown,
    softCosts: Math.round(core.softCosts),
    tenantCosts: Math.round(core.tenantCosts),
    bettermentTax: Math.round(core.bettermentTax),
    permitFees: Math.round(core.permitFees),
    landCost: Math.round(core.landCost),
    financingCosts: Math.round(core.financingCosts),
    treePreservationCost: Math.round(core.treePreservationCost),
    parkingBasementCost: Math.round(core.parkingBasementCost),
    dewateringCost: Math.round(core.dewateringCost),
    physicalConstraintsCost: Math.round(core.physicalConstraintsCost),
    totalProjectCost: Math.round(core.totalProjectCost),
    developerProfit: Math.round(core.developerProfit),
    rocPct: Number(core.rocPct.toFixed(2)),
    rosPct: Number(core.rosPct.toFixed(2)),
    irrPct: Number(irrPct.toFixed(2)),
    breakevenPricePerSqm: Math.round(breakevenPricePerSqm),
    verdict,
    verdictLabel,
    headline,
    targetProfitPct: target,
    sensitivity,
    monthlyCashflow: core.monthly,
    notes,
  };
}
