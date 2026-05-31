import type { FeasibilityReport } from "@/types/feasibility";

export type KpiTone = "success" | "warning" | "danger" | "neutral";

export interface KpiItem {
  key: string;
  label: string;
  value: string;
  tone: KpiTone;
  insight: string;
}

const fmt = (n: number, d = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("he-IL", { minimumFractionDigits: d, maximumFractionDigits: d })
    : "—";

const pct = (n: number, d = 0) =>
  Number.isFinite(n) ? `${(n * 100).toLocaleString("he-IL", { minimumFractionDigits: d, maximumFractionDigits: d })}%` : "—";

const band = (v: number, red: number, yellow: number, higherIsBetter = true): KpiTone => {
  if (!Number.isFinite(v)) return "neutral";
  if (higherIsBetter) {
    if (v < red) return "danger";
    if (v < yellow) return "warning";
    return "success";
  }
  if (v > red) return "danger";
  if (v > yellow) return "warning";
  return "success";
};

export function buildHeaderKpis(report: FeasibilityReport): KpiItem[] {
  const { existing, proposed, metrics, zoning } = report;

  // 1. Units multiplier
  const unitMult = existing.units > 0 ? proposed.units / existing.units : NaN;

  // 2. GFA multiplier
  const gfaMult =
    existing.builtAreaSqm > 0 ? proposed.builtAreaSqm / existing.builtAreaSqm : NaN;

  // 3. Coverage uplift
  const renewal = zoning.renewalPotential;
  const coverageUplift = renewal ? renewal.upliftPct / 100 : NaN;

  // 4. Tenant uplift per unit (sqm) — derived from renewalPotential when available
  let tenantPerUnitSqm = NaN;
  if (renewal && existing.units > 0) {
    const tenantTotal =
      (renewal.effectiveUpliftSqmTotal * renewal.tenantShareOfUpliftPct) / 100;
    tenantPerUnitSqm = tenantTotal / existing.units;
  }

  return [
    {
      key: "unitMult",
      label: 'מכפיל יח"ד',
      value: Number.isFinite(unitMult) ? `${fmt(unitMult, 2)}x` : "—",
      tone: band(unitMult, 1.8, 2.2),
      insight:
        'יחס בין יחידות חדשות לקיימות. <1.8 לרוב לא כלכלי, 1.8–2.2 גבולי, >2.2 טווח בריא להתחדשות.',
    },
    {
      key: "gfaMult",
      label: "מכפיל שטחים (GFA)",
      value: Number.isFinite(gfaMult) ? `${fmt(gfaMult, 2)}x` : "—",
      tone: band(gfaMult, 2.0, 2.5),
      insight:
        'יחס שטחי בנייה מוצע מול קיים — מדויק יותר ממכפיל יח"ד כי נטרל גודל דירה. סף כלכלי ~2.0.',
    },
    {
      key: "coverageUplift",
      label: "הגדלת תכסית",
      value: Number.isFinite(coverageUplift) ? pct(coverageUplift, 0) : "—",
      tone: band(coverageUplift, 0.1, 0.25),
      insight:
        'אחוז הגדלת התכסית האפקטיבית בהליך התחדשות מול קווי הבניין הסטטוטוריים — מקור עיקרי לתוספת ערך.',
    },
    {
      key: "tenantUplift",
      label: 'תמורה לדייר (מ"ר)',
      value: Number.isFinite(tenantPerUnitSqm) ? `+${fmt(tenantPerUnitSqm, 1)}` : "—",
      tone: band(tenantPerUnitSqm, 5, 12),
      insight:
        'תוספת שטח ממוצעת לכל דייר קיים שמקורה בהגדלת התכסית בלבד (לפני תוספת קומות). מחזק עמדת מו"מ.',
    },
    {
      key: "newUnits",
      label: 'יח"ד חדשות נטו',
      value: fmt(metrics.newUnits),
      tone: band(metrics.newUnits, existing.units * 0.8, existing.units * 1.2),
      insight:
        "יחידות נוספות מעבר להחזרת הקיים — אלו היחידות שמהוות את מקור ההכנסה ליזם.",
    },
    {
      key: "avgUnit",
      label: 'גודל דירה ממוצע',
      value: `${fmt(metrics.avgUnitSize)} מ"ר`,
      tone: band(metrics.avgUnitSize, 70, 95),
      insight:
        'גודל ממוצע ליחידה מוצעת. <70 מ"ר מאתגר שיווקית; 85–110 הוא הטווח האופטימלי בת"א.',
    },
  ];
}
