// Pure deterministic financial engine for Israeli real-estate feasibility.
// No AI. Same input -> same output.

export type ProjectType = "urban_renewal" | "new_construction" | "combination";
export type RenewalSubtype = "tama38" | "pinui_binui";
export type FinishLevel = "standard" | "premium" | "luxury";

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
  estimatedSellableArea: number;
  proposedUnits: number;
  zoning?: ZoningConstraints;

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
  demolitionCostPerSqm?: number;          // default 400 ₪/m² (urban renewal only)
  siteDevelopmentCostPerSqmPlot?: number; // default 450 ₪/m² of plot
  escalationPctPerYear?: number;          // default 3% — construction inflation
  contingencyPct?: number;                // default 5% — בלת"מ on hard cost
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
  aboveGroundAreaSqm: number;
  basementAreaSqm: number;
  effectiveAboveGroundRate: number;       // ₪/m² after finish + height premium
  effectiveBasementRate: number;          // ₪/m²
  aboveGroundCost: number;
  basementCost: number;
  finishLevel: FinishLevel;
  finishMultiplier: number;               // e.g. 1.0 / 1.15 / 1.30
  heightPremiumMultiplier: number;        // e.g. 1.00, 1.08, 1.20
  floorsAboveGround: number;
  demolitionCost: number;
  siteDevelopmentCost: number;
  baseHardCost: number;                   // sum above, before escalation/contingency
  escalationMultiplier: number;           // e.g. 1.0453
  escalationCost: number;
  contingencyPct: number;
  contingencyCost: number;
  totalHardCost: number;                  // == EngineReport.hardCosts
  effectiveCostPerSqmBuilt: number;       // totalHardCost / proposedBuiltAreaSqm
}

export interface EngineReport {
  // revenue
  totalSalesRevenue: number;
  netSalesRevenue: number;
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
  const totalSalesRevenue = input.estimatedSellableArea * input.avgSalePricePerSqm;
  const netSalesRevenue = totalSalesRevenue / (1 + input.vatPct / 100);
  return { totalSalesRevenue, netSalesRevenue };
}

export function computeHardSoft(input: EngineInput) {
  const hardCosts = input.proposedBuiltAreaSqm * input.buildCostPerSqm;
  const softCosts = hardCosts * (input.softCostsPct / 100);
  const permitFees = hardCosts * 0.01;
  return { hardCosts, softCosts, permitFees };
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
    Math.round(input.existingBuiltAreaSqm / 85), // rough proxy if not provided
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
  const requiredBasements = z.requiredBasementFloors ?? 1;
  let parkingBasementCost =
    Math.max(0, requiredBasements - 1) * input.proposedUnits * 100_000;
  if (z.todReliefApplies) parkingBasementCost *= 0.85;
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
  const { totalSalesRevenue, netSalesRevenue } = computeRevenues(input);
  const { hardCosts, softCosts, permitFees } = computeHardSoft(input);
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
    hardCosts,
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
    `מנוע חישוב דטרמיניסטי v1 — תזרים חודשי ל-${core.monthly.length - 1} חודשים, IRR ב-Newton-Raphson.`,
  );
  if (input.projectType === "urban_renewal") {
    notes.push("✓ קרקע = 0 (התחדשות עירונית — בבעלות הדיירים).");
    notes.push(
      `✓ פטור מהיטל השבחה לפי ${input.renewalSubtype === "pinui_binui" ? "חוק פינוי-בינוי" : "סעיף 19 לתוספת השלישית (תמ\"א 38)"}.`,
    );
    notes.push("✓ נוספה עלות ערבויות חוק מכר + ליווי משפטי דיירים (2.5% מ-Hard).");
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
    hardCosts: Math.round(core.hardCosts),
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
