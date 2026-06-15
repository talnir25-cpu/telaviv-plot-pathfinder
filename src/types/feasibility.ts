export interface Plot {
  q: 3 | 4;
  gush: number;
  helka: number;
  area: number | null;
  shapeArea: number | null;
}

export interface RedFlag {
  level: "critical" | "warning" | "info";
  title: string;
  description: string;
  source: string;
}

export interface FeasibilityReport {
  status: "high_potential" | "medium_potential" | "high_risk" | "blocked";
  statusLabel: string;
  headline: string;
  existing: {
    units: number;
    floors: number;
    builtAreaSqm: number;
    far: number;
  };
  proposed: {
    units: number;
    floors: number;
    builtAreaSqm: number;
    far: number;
    heightMeters: number;
    unitRange?: {
      min: number;
      base: number;
      max: number;
      avgUnitSizeMin: number;
      avgUnitSizeBase: number;
      avgUnitSizeMax: number;
    };
    sellableAreaSqm?: number;
  };
  metrics: {
    multiplier: number;
    newUnits: number;
    estimatedSellableArea: number;
    avgUnitSize: number;
  };
  zoning: {
    maxHeightMeters: number;
    maxFloors: number;
    frontSetbackM: number;
    sideSetbackM: number;
    rearSetbackM: number;
    maxFAR: number;
    source: string;
    // אילוצים פיזיים-רגולטוריים
    treesOnPlot?: number | null;            // עצים בחלקה (סקר עצים)
    treesForConservation?: number | null;   // מתוכם לשימור
    parkingStandardPerUnit?: number | null; // תקן חניה ליח״ד
    requiredBasementFloors?: number | null; // קומות מרתף נדרשות לחניה
    todReliefApplies?: boolean | null;      // הקלות TOD (קרבה לתח״צ מסילתית)
    groundwaterDepthM?: number | null;      // עומק מי תהום משוער (מ׳)
    dewateringRequired?: boolean | null;    // נדרשת השפלת מי תהום
    // תכסית מחושבת דטרמיניסטית מקווי הבניין (אופציונלי — מאוכלס ב-edge)
    typicalFloorAreaSqm?: number;           // שטח קומה טיפוסי מירבי (מ"ר)
    coveragePct?: number;                   // אחוז תכסית תכנונית (מעטפת קווי בניין)
    floorsNeededForFAR?: number;            // קומות נדרשות לתמיכה ב-proposed.builtAreaSqm
    setbackSource?: "regulation" | "manual" | "manual_override";
    // תכסית קיימת מ-GIS עיריית תל אביב (אופציונלי — ערך עובדתי על המבנה הקיים)
    coverageExistingPct?: number;           // אחוז תכסית קיימת מ-Shoelace על שכבת מבנים 513
    buildingFootprintSqm?: number;          // שטח טביעת מבנה קיים במ"ר
    coverageSource?: string;                // תיאור מקור/אמינות
    // פוטנציאל הגדלת תכסית בהליך התחדשות עירונית (אופציונלי)
    renewalPotential?: {
      track: "local_renewal" | "pinui_binui" | "rova_plan";
      trackLabel: string;
      frontSetbackM: number;
      sideSetbackM: number;
      rearSetbackM: number;
      typicalFloorAreaSqm: number;       // שטח קומה אחרי הליך התחדשות
      coveragePct: number;
      upliftSqmPerFloor: number;         // דלתא מול baseline
      upliftPct: number;                 // % מהתכסית הבסיסית
      realizationFactor: number;         // 0.7–1.0
      effectiveUpliftSqmTotal: number;   // upliftSqmPerFloor × floors × realizationFactor
      tenantShareOfUpliftPct: number;
      source: string;
    };
  };


  redFlags: RedFlag[];
  committeeSummary: string;
  sources: string[];
  // מקור החישוב של proposed.units / builtAreaSqm — שקיפות מלאה
  calculationSource?: CalculationSource;
}

export type CalculationSource =
  | {
      method: "regulation";
      plan_code: string;
      zone_label: string;
      source_citation: string;
      confidence: "high" | "medium" | "low";
      available_zones: string[];
      base_far_pct: number;
      far_bonus_pct: number;
      effective_far_pct: number;
      density_coefficient_sqm_per_unit: number;
      units_bonus_pct: number;
      max_floors: number;
      renewal_track: "local_renewal" | "pinui_binui" | "rova_plan";
      renewal_track_label: string;
    }
  | {
      method: "ai_estimate";
      renewal_track: "local_renewal" | "pinui_binui" | "rova_plan";
      renewal_track_label: string;
      multiplier_used: number;
      note: string;
    };

export interface AnalysisInput {
  quarter: 3 | 4;
  gush: number;
  helka: number;
  area: number | null;
  shapeArea: number | null;
  existingUnits: number;
  existingFloors: number;
  existingBuiltAreaSqm?: number;
  existingBuiltAreaSource?: string;
  existingBuiltAreaConfidence?: string;
  conservation: boolean;
  conservationDetails?: {
    level?: "מחמיר" | "רגיל" | null;
    buildingName?: string | null;
    planRef?: string | null;
    strictRestrictions?: boolean;
    inUnescoBuffer?: boolean;
    source?: string;
    confidence?: string;
    description?: string | null;
  };
  notes?: string;
  // קווי בניין שהוזנו / נטענו מהתקנון בטופס המקדים
  frontSetbackM?: number;
  sideSetbackM?: number;
  rearSetbackM?: number;
  plotWidthM?: number;
  plotDepthM?: number;
  buildingYear?: number;
  centroidX?: number;
  centroidY?: number;
  setbackSource?: "regulation" | "manual" | "manual_override";
  // דריסה ידנית של ייעוד הקרקע (לפי תקנון רובע)
  zoneLabelOverride?: string;
  areaHint?: "declaration" | "market_street" | "rest";
  // שם רחוב — לזיהוי ייעוד אוטומטי לפי טבלת רחובות בתקנון
  street?: string;
  address?: string;
  tabuAnalysis?: TabuAnalysis;
  // ── תכסית מדויקת מ-GIS עיריית תל אביב (אופציונלי) ──
  coverageExact?: number;          // אחוז תכסית מ-Shoelace על שכבת מבנים 513
  buildingFootprint?: number;      // שטח טביעת מבנה במ"ר
  coverageReliable?: boolean;      // true רק אם בדיקת היגיון עברה (≤95%)
  coverageStatus?: string;         // תיאור מקור/אמינות לתצוגה
}

export interface TabuWarning {
  text: string;
  party: string;
  year: number;
}

export interface TabuAnalysis {
  units: number;
  floors: number;
  avgUnitSize: number;
  plotArea: number;
  coverageRatio: number;
  buildingYear: number | null;
  warnings: TabuWarning[];
  hasActiveRenewal: boolean;
  renewalParty: string | null;
  floorsDetected?: {
    labels: string[];
    hasGround: boolean;
    hasRoof: boolean;
    hasBasement: boolean;
    highestAboveGround: number;
  };
  floorsExplain?: string;
  floorsExplicit?: number | null;
}


// ============ Financial analysis ============

export type ProjectType = "urban_renewal" | "new_construction" | "combination";
export type RenewalSubtype = "local_renewal" | "pinui_binui";
export type FinishLevel = "standard" | "premium" | "luxury";
export type ConstructionMode = "full_rebuild" | "addition_only";

export interface FinancialInput {
  // סוג פרויקט — קובע את לוגיקת הקרקע, הדיירים והמיסוי
  projectType: ProjectType;
  // תת-סוג להתחדשות עירונית — משפיע על פטור היטל השבחה
  renewalSubtype?: RenewalSubtype;
  // רק ל-combination: חלק היזם בקרקע (%) — היתר משולם לבעלים
  developerLandSharePct?: number;
  // הזנה / ברירת מחדל מ-AI
  avgSalePricePerSqm: number;          // מחיר מכירה ממוצע למ"ר (₪)
  buildCostPerSqm: number;              // עלות בנייה Hard בסיסית למ"ר מעל-קרקע (₪)
  softCostsPct: number;                 // % מעלות הבנייה (תכנון, ניהול, יועצים)
  vatPct: number;                       // שיעור מע"מ (%)
  equity: number;                       // הון עצמי זמין (₪)
  loanInterestPct: number;              // ריבית שנתית על מימון (%)
  constructionMonths: number;           // משך הקמה (חודשים)
  tenantRentPerMonth: number;           // שכר דירה חודשי לדייר (₪) — רלוונטי להתחדשות
  tenantEvacuationCost: number;         // עלות פינוי חד-פעמית לדייר (₪) — רלוונטי להתחדשות
  targetDeveloperProfitPct: number;    // רף רווח יזמי מבוקש (%)
  landValuePerSqm: number;              // שווי קרקע למ"ר (₪) — רלוונטי לבנייה חדשה/קומבינציה
  bettermentTaxPct: number;             // היטל השבחה (%) משווי השבחה
  // ─── דיוק חישוב עלות בנייה (אופציונלי) ───
  finishLevel?: FinishLevel;            // standard / premium / luxury
  basementCostMultiplier?: number;      // ברירת מחדל 0.70
  basementAreaPerFloorRatio?: number;   // מ"ר מרתף כיחס משטח המגרש (0.85)
  demolitionCostPerSqm?: number;        // ₪/מ"ר להריסה (400) — רק במצב full_rebuild
  siteDevelopmentCostPerSqmPlot?: number; // ₪/מ"ר פיתוח שטח (450)
  escalationPctPerYear?: number;        // אינפלציית בנייה שנתית (3%)
  contingencyPct?: number;              // בלת"מ (5%)
  // ─── מצב בנייה (דלתא מול קיים) ───
  constructionMode?: ConstructionMode;  // full_rebuild (הריסה+בנייה) או addition_only (חיזוק+תוספת)
  strengtheningCostPerSqm?: number;     // ₪/מ"ר חיזוק קיים (3,000) — רק ב-addition_only
  // ─── פירוט הכנסות (אופציונלי) ───
  revenue?: RevenueParams;              // אם מסופק, מחליף את חישוב ההכנסות הפשוט (avgPrice × area)
}

// ============ Revenue detail ============

export type UnitType = "studio" | "2room" | "3room" | "4room" | "5room" | "penthouse" | "garden";

export interface UnitMixRow {
  type: UnitType;
  count: number;
  avgSizeSqm: number;
  pricePerSqm: number;            // ניתן לדריסה ידנית; ברירת מחדל = avgSalePricePerSqm
}

export interface RevenueParams {
  unitMix: UnitMixRow[];                 // פילוח דירות למכירה (לא כולל דירות בעלים)
  floorPremiumPctPerFloor?: number;      // 0.8% — תוספת מחיר לכל קומה מעל הראשונה
  penthousePremiumPct?: number;          // 25% — פרמיית פנטהאוז
  storageUnitsCount?: number;            // מחסנים
  storagePricePerUnit?: number;          // 25,000 ₪
  extraParkingCount?: number;            // חניות עודפות
  extraParkingPricePerUnit?: number;     // 120,000 ₪
  commercialAreaSqm?: number;            // שטחי מסחר
  commercialPricePerSqm?: number;        // ₪/מ"ר מסחרי
  marketingDiscountPct?: number;         // 2% — הנחות שיווק
  brokerageFeePct?: number;              // 2% — עמלות תיווך
  absorptionRatePerMonth?: number;       // יח"ד/חודש — קצב מכירה
  priceEscalationPctPerYear?: number;    // 3% — צמיחת מחירי דיור לאורך תקופת המכירה
}

export interface UnitMixBreakdownRow {
  type: UnitType;
  label: string;
  count: number;
  avgSizeSqm: number;
  pricePerSqm: number;
  basePrice: number;              // count × size × price
  premiumPct: number;             // type + floor premium (decimal, e.g. 0.27)
  totalRevenue: number;           // basePrice × (1 + premiumPct)
}

export interface AncillaryRevenueRow {
  label: string;
  detail: string;                 // e.g. "22 × 25,000 ₪"
  total: number;
}

export interface RevenueBreakdown {
  unitMixRows: UnitMixBreakdownRow[];
  unitMixTotal: number;
  ancillaryRows: AncillaryRevenueRow[];
  ancillaryTotal: number;
  grossRevenue: number;                   // unitMix + ancillary (VAT-incl, pre-escalation)
  salesDurationMonths: number;
  escalationMultiplier: number;
  escalationUplift: number;               // grossRevenue × (esc - 1)
  escalatedRevenue: number;               // grossRevenue × escalationMultiplier
  marketingDiscountPct: number;
  marketingDiscount: number;
  brokerageFeePct: number;
  brokerageFee: number;
  netRevenueToDeveloper: number;          // VAT-incl after discount + brokerage
}


export interface SensitivityCell {
  priceDelta: number;     // -5, 0, +5 (%)
  costDelta: number;      // -5, 0, +5 (%)
  profit: number;         // ₪
  roc: number;            // %
}

export interface ConstructionBreakdown {
  constructionMode: ConstructionMode;
  existingBuiltAreaSqm: number;
  addedBuiltAreaSqm: number;
  aboveGroundAreaSqm: number;
  basementAreaSqm: number;
  effectiveAboveGroundRate: number;
  effectiveBasementRate: number;
  aboveGroundCost: number;
  basementCost: number;
  strengtheningCost: number;
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
  effectiveCostPerSqmBuilt: number;
}

export interface FinancialReport {
  // הכנסות
  totalSalesRevenue: number;            // פדיון ממכירות (כולל מע"מ)
  netSalesRevenue: number;              // נטו (ללא מע"מ)
  // עלויות
  hardCosts: number;                    // עלות בנייה ישירה (כולל הריסה, פיתוח, אסקלציה, בלת"מ)
  constructionBreakdown: ConstructionBreakdown;
  softCosts: number;                    // תכנון/ניהול
  tenantCosts: number;                  // פינוי + שכ"ד דיירים
  bettermentTax: number;                // היטל השבחה
  permitFees: number;                   // דמי היתר
  landCost: number;                     // שווי קרקע
  financingCosts: number;               // עלויות מימון
  // אילוצים פיזיים-רגולטוריים
  treePreservationCost?: number;        // עצים לשימור / כופר / העתקה
  parkingBasementCost?: number;         // מרתפי חניה (תוספת מעבר ל-Hard בסיסי)
  dewateringCost?: number;              // השפלת מי תהום
  physicalConstraintsCost?: number;     // סכום כולל של אילוצים פיזיים
  totalProjectCost: number;             // סה"כ עלות פרויקט (כולל אילוצים פיזיים)
  // רווחיות
  developerProfit: number;              // רווח יזמי (₪)
  rocPct: number;                       // Return on Cost (%)
  rosPct: number;                       // Return on Sales / מחזור (%)
  irrPct: number;                       // IRR (%)
  breakevenPricePerSqm: number;         // מחיר מכירה מינ' לאיזון
  // הערכה כוללת
  verdict: "profitable" | "marginal" | "loss";
  verdictLabel: string;                 // תווית בעברית
  headline: string;                     // משפט סיכום
  targetProfitPct?: number;             // רף רווח יזמי מבוקש (%) — להשוואה ויזואלית

  // רגישות
  sensitivity: SensitivityCell[];       // 9 תאים: -5/0/+5 × -5/0/+5
  notes: string[];                      // הערות / הנחות עבודה
  // תזרים חודשי (אופציונלי — להצגה בגרף)
  monthlyCashflow?: Array<{
    month: number;
    inflow: number;
    outflow: number;
    net: number;
    debtBalance: number;
  }>;
  // פירוט הכנסות (אופציונלי — מוחזר רק אם input.revenue סופק)
  revenueBreakdown?: RevenueBreakdown;
  // תמורה לדיירים מהגדלת תכסית בהליך התחדשות (אינפורמטיבי — לא משפיע על profit)
  tenantUpliftFromCoverage?: {
    trackLabel: string;
    additionalGFA: number;
    additionalValue: number;
    tenantSharePct: number;
    tenantUpliftValue: number;
    perUnitUpliftValue: number;
    perUnitUpliftSqm: number;
    existingUnits: number;
  };
}

