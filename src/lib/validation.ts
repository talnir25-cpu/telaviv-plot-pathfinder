import { z } from "zod";


/* ───────────────────────── helpers ───────────────────────── */

const intPositive = (label: string, max = 1_000_000) =>
  z
    .number({ invalid_type_error: `${label}: יש להזין מספר` })
    .int(`${label}: יש להזין מספר שלם`)
    .min(1, `${label}: חייב להיות לפחות 1`)
    .max(max, `${label}: ערך חורג מהסביר`);

const nonNegative = (label: string, max = 1e12) =>
  z
    .number({ invalid_type_error: `${label}: יש להזין מספר` })
    .min(0, `${label}: לא יכול להיות שלילי`)
    .max(max, `${label}: ערך חורג מהסביר`);

const pct = (label: string, min = 0, max = 100) =>
  z
    .number({ invalid_type_error: `${label}: יש להזין מספר` })
    .min(min, `${label}: חייב להיות לפחות ${min}%`)
    .max(max, `${label}: לא יכול לעלות על ${max}%`);

/* ───────────────────────── AnalysisInput ───────────────────────── */

export const analysisInputSchema = z
  .object({
    quarter: z.union([z.literal(3), z.literal(4)]),
    gush: intPositive("גוש", 99_999),
    helka: intPositive("חלקה", 99_999),
    area: z.number().nullable(),
    shapeArea: z.number().nullable(),
    existingUnits: intPositive('יח"ד קיימות', 500),
    existingFloors: intPositive("קומות קיימות", 60),
    existingBuiltAreaSqm: z
      .number()
      .positive('שטח בנוי קיים: חייב להיות גדול מ-0')
      .max(200_000, "שטח בנוי קיים: ערך חורג מהסביר")
      .optional(),
    existingBuiltAreaSource: z.string().optional(),
    existingBuiltAreaConfidence: z.string().optional(),
    conservation: z.boolean(),
    notes: z.string().max(2000, "הערות: עד 2000 תווים").optional(),
    frontSetbackM: z.number().min(0, "קו בניין קדמי: לא שלילי").max(15, "קו בניין קדמי: עד 15 מ׳").optional(),
    sideSetbackM: z.number().min(0, "קו בניין צדדי: לא שלילי").max(15, "קו בניין צדדי: עד 15 מ׳").optional(),
    rearSetbackM: z.number().min(0, "קו בניין אחורי: לא שלילי").max(15, "קו בניין אחורי: עד 15 מ׳").optional(),
    setbackSource: z.enum(["regulation", "manual", "manual_override"]).optional(),
  })
  .superRefine((v, ctx) => {
    // עקביות שטח: שטח בנוי לא יכול לעלות על שטח מגרש × קומות × 2 (חוצן בטיחות)
    const plot = v.area ?? v.shapeArea ?? 0;
    if (v.existingBuiltAreaSqm && plot > 0) {
      const upper = plot * Math.max(1, v.existingFloors) * 2;
      if (v.existingBuiltAreaSqm > upper) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `שטח בנוי (${v.existingBuiltAreaSqm} מ"ר) לא הגיוני ביחס לשטח המגרש (${plot} מ"ר) ו-${v.existingFloors} קומות`,
          path: ["existingBuiltAreaSqm"],
        });
      }
    }
  });

/* ───────────────────────── FinancialInput ───────────────────────── */

export const financialInputSchema = z
  .object({
    projectType: z.enum(["urban_renewal", "new_construction", "combination"]),
    renewalSubtype: z.enum(["tama38", "pinui_binui"]).optional(),
    developerLandSharePct: pct("חלק היזם בקרקע", 1, 100).optional(),
    avgSalePricePerSqm: z
      .number({ invalid_type_error: "מחיר מכירה: יש להזין מספר" })
      .positive('מחיר מכירה חייב להיות גדול מ-0 ₪/מ"ר')
      .max(500_000, 'מחיר מכירה: ערך חורג מהסביר (>500,000 ₪/מ"ר)'),
    buildCostPerSqm: z
      .number()
      .positive('עלות בנייה חייבת להיות גדולה מ-0 ₪/מ"ר')
      .max(100_000, 'עלות בנייה: ערך חורג מהסביר'),
    softCostsPct: pct("Soft costs", 0, 50),
    vatPct: pct("מע״מ", 0, 30),
    equity: nonNegative("הון עצמי"),
    loanInterestPct: pct("ריבית מימון", 0, 30),
    constructionMonths: z
      .number()
      .int("משך הקמה: מספר שלם של חודשים")
      .min(6, "משך הקמה: לפחות 6 חודשים")
      .max(120, "משך הקמה: עד 120 חודשים"),
    tenantRentPerMonth: nonNegative("שכ״ד לדייר", 100_000),
    tenantEvacuationCost: nonNegative("פינוי לדייר", 1_000_000),
    targetDeveloperProfitPct: pct("רף רווח יזמי", 0, 50),
    landValuePerSqm: nonNegative("שווי קרקע", 500_000),
    bettermentTaxPct: pct("היטל השבחה", 0, 100),
    finishLevel: z.enum(["standard", "premium", "luxury"]).optional(),
    basementCostMultiplier: z.number().min(0).max(2).optional(),
    basementAreaPerFloorRatio: z.number().min(0).max(1).optional(),
    demolitionCostPerSqm: nonNegative("הריסה", 5_000).optional(),
    siteDevelopmentCostPerSqmPlot: nonNegative("פיתוח שטח", 5_000).optional(),
    escalationPctPerYear: pct("אסקלציה שנתית", 0, 20).optional(),
    contingencyPct: pct('בלת"מ', 0, 20).optional(),
    constructionMode: z.enum(["full_rebuild", "addition_only"]).optional(),
    strengtheningCostPerSqm: nonNegative("עלות חיזוק", 20_000).optional(),
    revenue: z.any().optional(),
  })
  .superRefine((v, ctx) => {
    // עקביות מע"מ: אם vatPct = 0 — אזהרה ברורה (פדיון ברוטו = נטו)
    if (v.vatPct === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'מע״מ הוגדר כ-0% — הפדיון ברוטו יהיה זהה לנטו. הגדר/י שיעור מע״מ תקף (לרוב 18%) או אשר/י במפורש.',
        path: ["vatPct"],
      });
    }
    // התחדשות עירונית — חובה תת-סוג
    if (v.projectType === "urban_renewal" && !v.renewalSubtype) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "התחדשות עירונית: יש לבחור תת-סוג (תמ״א 38 / פינוי-בינוי)",
        path: ["renewalSubtype"],
      });
    }
    // קומבינציה — חובה חלק היזם
    if (v.projectType === "combination" && (v.developerLandSharePct == null || v.developerLandSharePct <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "קומבינציה: חלק היזם בקרקע חייב להיות גדול מ-0%",
        path: ["developerLandSharePct"],
      });
    }
    // בנייה חדשה — שווי קרקע חובה
    if (v.projectType === "new_construction" && v.landValuePerSqm <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'בנייה חדשה: שווי קרקע חייב להיות גדול מ-0 ₪/מ"ר',
        path: ["landValuePerSqm"],
      });
    }
    // התחדשות עירונית — חייב להיות שכ"ד / פינוי לדיירים > 0
    if (v.projectType === "urban_renewal") {
      if (v.tenantRentPerMonth <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "התחדשות עירונית: שכ״ד לדייר חייב להיות גדול מ-0",
          path: ["tenantRentPerMonth"],
        });
      }
      if (v.tenantEvacuationCost <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "התחדשות עירונית: עלות פינוי לדייר חייבת להיות גדולה מ-0",
          path: ["tenantEvacuationCost"],
        });
      }
    }
    // עקביות סבירות: מחיר מכירה < עלות בנייה ⇒ הפסד מובטח
    if (v.avgSalePricePerSqm > 0 && v.buildCostPerSqm > 0 && v.avgSalePricePerSqm < v.buildCostPerSqm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'אזהרה: מחיר מכירה נמוך מעלות בנייה — הפרויקט יתקבל כהפסד ודאי',
        path: ["avgSalePricePerSqm"],
      });
    }
  });

/* ───────────────────────── error helpers ───────────────────────── */

export type FieldErrors = Record<string, string>;

export const flattenErrors = (err: z.ZodError): FieldErrors => {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const path = issue.path.join(".") || "_";
    if (!out[path]) out[path] = issue.message;
  }
  return out;
};

export const formatErrorList = (err: z.ZodError): string[] =>
  err.issues.map((i) => i.message);
