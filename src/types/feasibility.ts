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
  };

  redFlags: RedFlag[];
  committeeSummary: string;
  sources: string[];
}

export interface AnalysisInput {
  quarter: 3 | 4;
  gush: number;
  helka: number;
  area: number | null;
  shapeArea: number | null;
  existingUnits: number;
  existingFloors: number;
  conservation: boolean;
  notes?: string;
}

// ============ Financial analysis ============

export interface FinancialInput {
  // הזנה / ברירת מחדל מ-AI
  avgSalePricePerSqm: number;          // מחיר מכירה ממוצע למ"ר (₪)
  buildCostPerSqm: number;              // עלות בנייה למ"ר (₪)
  softCostsPct: number;                 // % מעלות הבנייה (תכנון, ניהול, יועצים)
  vatPct: number;                       // שיעור מע"מ (%)
  equity: number;                       // הון עצמי זמין (₪)
  loanInterestPct: number;              // ריבית שנתית על מימון (%)
  constructionMonths: number;           // משך הקמה (חודשים)
  tenantRentPerMonth: number;           // שכר דירה חודשי לדייר (₪)
  tenantEvacuationCost: number;         // עלות פינוי חד-פעמית לדייר (₪)
  targetDeveloperProfitPct: number;    // רף רווח יזמי מבוקש (%)
  landValuePerSqm: number;              // שווי קרקע למ"ר (₪)
  bettermentTaxPct: number;             // היטל השבחה (%) משווי השבחה
}

export interface SensitivityCell {
  priceDelta: number;     // -5, 0, +5 (%)
  costDelta: number;      // -5, 0, +5 (%)
  profit: number;         // ₪
  roc: number;            // %
}

export interface FinancialReport {
  // הכנסות
  totalSalesRevenue: number;            // פדיון ממכירות (כולל מע"מ)
  netSalesRevenue: number;              // נטו (ללא מע"מ)
  // עלויות
  hardCosts: number;                    // עלות בנייה ישירה
  softCosts: number;                    // תכנון/ניהול
  tenantCosts: number;                  // פינוי + שכ"ד דיירים
  bettermentTax: number;                // היטל השבחה
  permitFees: number;                   // דמי היתר
  landCost: number;                     // שווי קרקע
  financingCosts: number;               // עלויות מימון
  totalProjectCost: number;             // סה"כ עלות פרויקט
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
  // רגישות
  sensitivity: SensitivityCell[];       // 9 תאים: -5/0/+5 × -5/0/+5
  notes: string[];                      // הערות / הנחות עבודה
}
