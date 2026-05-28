import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Coins,
  Calculator,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ConstructionMode,
  FeasibilityReport,
  FinancialInput,
  FinancialReport,
  FinishLevel,
  ProjectType,
  RenewalSubtype,
  RevenueParams,
  UnitMixRow,
  UnitType,
} from "@/types/feasibility";

// Build a sensible default unit-mix for the # of sale units.
const buildDefaultUnitMix = (saleUnits: number, pricePerSqm: number): UnitMixRow[] => {
  const n = Math.max(0, Math.round(saleUnits));
  if (n === 0) return [];
  const penthouse = Math.min(4, Math.max(n >= 20 ? 1 : 0, Math.round(n * 0.05)));
  const garden = Math.min(2, Math.round(n * 0.04));
  let remaining = Math.max(0, n - penthouse - garden);
  const three = Math.round(remaining * 0.35);
  const four = Math.round(remaining * 0.50);
  const five = Math.max(0, remaining - three - four);
  const rows: UnitMixRow[] = [];
  if (three > 0) rows.push({ type: "3room", count: three, avgSizeSqm: 85, pricePerSqm });
  if (four > 0) rows.push({ type: "4room", count: four, avgSizeSqm: 110, pricePerSqm });
  if (five > 0) rows.push({ type: "5room", count: five, avgSizeSqm: 135, pricePerSqm });
  if (garden > 0) rows.push({ type: "garden", count: garden, avgSizeSqm: 120, pricePerSqm: Math.round(pricePerSqm * 1.05) });
  if (penthouse > 0) rows.push({ type: "penthouse", count: penthouse, avgSizeSqm: 160, pricePerSqm });
  return rows;
};

const UNIT_TYPE_LABEL_HE: Record<UnitType, string> = {
  studio: "סטודיו", "2room": "2 חד׳", "3room": "3 חד׳", "4room": "4 חד׳",
  "5room": "5 חד׳", penthouse: "פנטהאוז", garden: "דירת גן",
};


interface Props {
  plot: { gush: number; helka: number; quarter: 3 | 4; area: number };
  planning: FeasibilityReport;
}

const fmtNIS = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toLocaleString("he-IL", { maximumFractionDigits: 2 })} מ׳ ₪`
    : `${Math.round(n).toLocaleString("he-IL")} ₪`;

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const VERDICT_META: Record<FinancialReport["verdict"], { label: string; tone: string; icon: typeof TrendingUp }> = {
  profitable: { label: "רווחי", tone: "bg-primary/10 text-primary border-primary/30", icon: TrendingUp },
  marginal: { label: "שולי", tone: "bg-amber-500/10 text-amber-700 border-amber-500/30", icon: Minus },
  loss: { label: "הפסד", tone: "bg-destructive/10 text-destructive border-destructive/30", icon: TrendingDown },
};

type FieldDef = { key: keyof FinancialInput; label: string; suffix: string; group: string };

const ALL_FIELDS: FieldDef[] = [
  { key: "avgSalePricePerSqm", label: 'מחיר מכירה ממוצע', suffix: '₪/מ"ר', group: "מכירות" },
  { key: "buildCostPerSqm", label: "עלות בנייה (Hard בסיס)", suffix: '₪/מ"ר', group: "בנייה" },
  { key: "strengtheningCostPerSqm", label: "עלות חיזוק קיים (תמ״א 38/1)", suffix: '₪/מ"ר', group: "בנייה" },
  { key: "softCostsPct", label: "Soft costs", suffix: "%", group: "בנייה" },
  { key: "escalationPctPerYear", label: "אסקלציה שנתית", suffix: "%", group: "בנייה" },
  { key: "contingencyPct", label: 'בלת"מ', suffix: "%", group: "בנייה" },
  { key: "vatPct", label: "מע״מ", suffix: "%", group: "מכירות" },
  { key: "landValuePerSqm", label: "שווי קרקע", suffix: '₪/מ"ר', group: "מכירות" },
  { key: "bettermentTaxPct", label: "היטל השבחה", suffix: "%", group: "מכירות" },
  { key: "developerLandSharePct", label: "חלק היזם בקרקע", suffix: "%", group: "מכירות" },
  { key: "equity", label: "הון עצמי", suffix: "₪", group: "מימון" },
  { key: "loanInterestPct", label: "ריבית מימון", suffix: "% שנתי", group: "מימון" },
  { key: "constructionMonths", label: "משך הקמה", suffix: "חודשים", group: "מימון" },
  { key: "tenantRentPerMonth", label: "שכ״ד לדייר", suffix: "₪/חודש", group: "מימון" },
  { key: "tenantEvacuationCost", label: "פינוי לדייר", suffix: "₪", group: "מימון" },
  { key: "targetDeveloperProfitPct", label: "רף רווח יזמי מבוקש", suffix: "%", group: "מימון" },
];

const FINISH_LABEL: Record<FinishLevel, { label: string; hint: string }> = {
  standard: { label: "סטנדרט", hint: "×1.00" },
  premium: { label: "פרימיום", hint: "×1.15" },
  luxury: { label: "יוקרה", hint: "×1.30" },
};

const PROJECT_TYPE_LABEL: Record<ProjectType, string> = {
  urban_renewal: "התחדשות עירונית (תמ״א 38/2, פינוי-בינוי)",
  new_construction: "בנייה חדשה (קרקע פנויה)",
  combination: "עסקת קומבינציה",
};

const PROJECT_TYPE_HINT: Record<ProjectType, string> = {
  urban_renewal: "הקרקע בבעלות הדיירים — שווי הקרקע לא נכלל. עלויות הדיירים (פינוי+שכ״ד) פעילות. פטור היטל השבחה לפי סעיף 19.",
  new_construction: "היזם רוכש קרקע פנויה — שווי הקרקע מלא. אין עלויות דיירים. היטל השבחה מלא.",
  combination: "היזם מקבל אחוז מהקרקע מהבעלים — שווי קרקע משוקלל לפי 'חלק היזם'. הוסף עלויות דיירים אם נדרש פינוי.",
};

const fieldsForType = (input: FinancialInput): FieldDef[] => {
  const hidden = new Set<keyof FinancialInput>();
  if (input.projectType === "urban_renewal") {
    hidden.add("landValuePerSqm");
    hidden.add("developerLandSharePct");
  } else if (input.projectType === "new_construction") {
    hidden.add("tenantRentPerMonth");
    hidden.add("tenantEvacuationCost");
    hidden.add("developerLandSharePct");
  }
  // strengthening cost only relevant in addition_only mode
  const effectiveMode: ConstructionMode = input.constructionMode ??
    (input.projectType === "urban_renewal" && (input.renewalSubtype ?? "tama38") === "tama38"
      ? "addition_only"
      : "full_rebuild");
  if (effectiveMode !== "addition_only") hidden.add("strengtheningCostPerSqm");
  return ALL_FIELDS.filter((f) => !hidden.has(f.key));
};

export const FinancialAnalysis = ({ plot, planning }: Props) => {
  const [input, setInput] = useState<FinancialInput | null>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<FinancialReport | null>(null);

  // Fetch AI-suggested defaults on mount / when plot changes
  useEffect(() => {
    let cancelled = false;
    setReport(null);
    setInput(null);
    setLoadingDefaults(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("financial-analysis", {
          body: {
            mode: "defaults",
            quarter: plot.quarter,
            gush: plot.gush,
            helka: plot.helka,
            plotArea: plot.area,
            proposedUnits: planning.proposed.units,
            proposedBuiltArea: planning.proposed.builtAreaSqm,
          },
        });
        if (cancelled) return;
        if (error || !data?.defaults) {
          toast.error("שגיאה בטעינת ברירות מחדל פיננסיות");
          return;
        }
        const d = data.defaults;
        // Build default revenue: procedural unit mix from proposed units minus owner-return
        const saleUnits = Math.max(0, planning.proposed.units - (planning.existing?.units ?? 0));
        const defaultRevenue: RevenueParams = {
          unitMix: buildDefaultUnitMix(saleUnits, d.avgSalePricePerSqm),
          floorPremiumPctPerFloor: 0.8,
          penthousePremiumPct: 25,
          storageUnitsCount: saleUnits,
          storagePricePerUnit: 25_000,
          extraParkingCount: Math.round(saleUnits * 0.10),
          extraParkingPricePerUnit: 120_000,
          commercialAreaSqm: 0,
          commercialPricePerSqm: 0,
          marketingDiscountPct: 2,
          brokerageFeePct: 2,
          absorptionRatePerMonth: 4,
          priceEscalationPctPerYear: 3,
        };
        setInput({
          projectType: "urban_renewal",
          renewalSubtype: "tama38",
          developerLandSharePct: 50,
          avgSalePricePerSqm: d.avgSalePricePerSqm,
          buildCostPerSqm: d.buildCostPerSqm,
          softCostsPct: d.softCostsPct,
          vatPct: d.vatPct,
          equity: Math.round(planning.proposed.builtAreaSqm * d.buildCostPerSqm * 0.25),
          loanInterestPct: d.loanInterestPct,
          constructionMonths: d.constructionMonths,
          tenantRentPerMonth: d.tenantRentPerMonth,
          tenantEvacuationCost: d.tenantEvacuationCost,
          targetDeveloperProfitPct: 15,
          landValuePerSqm: d.landValuePerSqm,
          bettermentTaxPct: d.bettermentTaxPct,
          finishLevel: "standard",
          escalationPctPerYear: 3,
          contingencyPct: 5,
          strengtheningCostPerSqm: 3000,
          revenue: defaultRevenue,
        });

      } finally {
        if (!cancelled) setLoadingDefaults(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plot.gush, plot.helka, plot.quarter, plot.area, planning.proposed.units, planning.proposed.builtAreaSqm]);

  const updateField = (key: keyof FinancialInput, value: string) => {
    if (!input) return;
    const num = Number(value.replace(/[^\d.]/g, ""));
    setInput({ ...input, [key]: isNaN(num) ? 0 : num });
  };

  const runAnalysis = async () => {
    if (!input) return;
    setAnalyzing(true);
    setReport(null);
    try {
      const { data, error } = await supabase.functions.invoke("financial-analysis", {
        body: {
          mode: "analyze",
          plot,
          planning,
          financial: input,
        },
      });
      if (error || !data?.report) {
        toast.error(error?.message || data?.error || "שגיאה בניתוח פיננסי");
        return;
      }
      setReport(data.report as FinancialReport);
    } finally {
      setAnalyzing(false);
    }
  };

  if (loadingDefaults || !input) {
    return (
      <Card className="flex items-center justify-center gap-3 p-12 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        טוען המלצות פיננסיות מבוססות AI...
      </Card>
    );
  }

  const groups = ["מכירות", "בנייה", "מימון"];
  const visibleFields = fieldsForType(input);

  return (
    <div className="space-y-6">
      <Card className="space-y-5 p-6 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">ניתוח פיננסי וכלכלי</h2>
              <p className="text-xs text-muted-foreground">
                ערכי ברירת מחדל הוצעו אוטומטית — תקן/י לפי הצורך והפק/י דוח רווחיות
              </p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Sparkles className="h-3 w-3" />
            הוצע ע״י AI
          </Badge>
        </div>

        {/* Project type selector */}
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <Label className="text-xs font-semibold">סוג הפרויקט</Label>
          <Select
            value={input.projectType}
            onValueChange={(v) => setInput({ ...input, projectType: v as ProjectType })}
          >
            <SelectTrigger className="bg-card text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PROJECT_TYPE_LABEL) as ProjectType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {PROJECT_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {PROJECT_TYPE_HINT[input.projectType]}
          </p>

          {input.projectType === "urban_renewal" && (
            <div className="mt-2 space-y-1.5">
              <Label className="text-xs font-semibold">תת-סוג התחדשות עירונית</Label>
              <div className="flex gap-2">
                {(["tama38", "pinui_binui"] as RenewalSubtype[]).map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setInput({ ...input, renewalSubtype: sub })}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      (input.renewalSubtype ?? "tama38") === sub
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {sub === "tama38" ? 'תמ"א 38 / 38-2' : "פינוי-בינוי"}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                שני המסלולים פטורים מהיטל השבחה — תמ"א 38 לפי סעיף 19, פינוי-בינוי לפי חוק פינוי-בינוי.
              </p>
            </div>
          )}

          {/* Construction mode: full rebuild vs strengthening + addition */}
          {(input.projectType === "urban_renewal" || input.projectType === "combination") && (
            <div className="mt-2 space-y-1.5">
              <Label className="text-xs font-semibold">מצב בנייה</Label>
              <div className="flex gap-2">
                {([
                  { id: "full_rebuild", label: "הריסה + בנייה מחדש", hint: 'תמ"א 38/2, פינוי-בינוי' },
                  { id: "addition_only", label: "חיזוק + תוספת", hint: 'תמ"א 38/1' },
                ] as { id: ConstructionMode; label: string; hint: string }[]).map((m) => {
                  const effective: ConstructionMode = input.constructionMode ??
                    (input.projectType === "urban_renewal" && (input.renewalSubtype ?? "tama38") === "tama38"
                      ? "addition_only"
                      : "full_rebuild");
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setInput({ ...input, constructionMode: m.id })}
                      className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                        effective === m.id
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "border-border bg-card text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <div>{m.label}</div>
                      <div className="text-[9px] opacity-70">{m.hint}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                במצב "חיזוק + תוספת": עלות הבנייה החדשה תחול רק על השטח המתווסף (proposed − existing), ועל השטח הקיים תחושב עלות חיזוק בלבד. אין הריסה.
              </p>
            </div>
          )}
        </div>


        {/* Finish level selector */}
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <Label className="text-xs font-semibold">רמת גמר (קובעת מכפיל על עלות בנייה מעל-קרקע)</Label>
          <div className="flex gap-2">
            {(["standard", "premium", "luxury"] as FinishLevel[]).map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setInput({ ...input, finishLevel: lvl })}
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  (input.finishLevel ?? "standard") === lvl
                    ? "border-primary bg-primary/10 text-primary font-semibold"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                {FINISH_LABEL[lvl].label} <span className="opacity-60">{FINISH_LABEL[lvl].hint}</span>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            מכפיל על עלות הבנייה מעל-קרקע בלבד. מרתפים לא מושפעים. נוסף עליו פרמיית גובה אוטומטית מעל 9 קומות.
          </p>
        </div>



        {groups.map((g) => (
          <div key={g} className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">{g}</h3>
            <div className="grid gap-4 md:grid-cols-3">
              {visibleFields.filter((f) => f.group === g).map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={f.key} className="text-xs">
                    {f.label}
                  </Label>
                  <div className="relative">
                    <Input
                      id={f.key}
                      inputMode="decimal"
                      value={(input[f.key] as number | undefined) ?? 0}
                      onChange={(e) => updateField(f.key, e.target.value)}
                      className="pl-16 text-sm"
                    />
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                      {f.suffix}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <Button
          onClick={runAnalysis}
          disabled={analyzing}
          size="lg"
          className="w-full bg-gradient-hero text-primary-foreground hover:opacity-95"
        >
          {analyzing ? (
            <>
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              מחשב רווחיות, מימון ורגישות...
            </>
          ) : (
            <>
              <Calculator className="ml-2 h-4 w-4" />
              הפק דוח פיננסי
            </>
          )}
        </Button>
      </Card>

      {report && <FinancialReportCard report={report} />}
    </div>
  );
};

const FinancialReportCard = ({ report }: { report: FinancialReport }) => {
  const meta = VERDICT_META[report.verdict];
  const VerdictIcon = meta.icon;

  return (
    <Card className="space-y-6 p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-lg border ${meta.tone}`}>
            <VerdictIcon className="h-5 w-5" />
          </div>
          <div>
            <Badge variant="outline" className={meta.tone}>
              {report.verdictLabel || meta.label}
            </Badge>
            <p className="mt-1.5 max-w-xl text-sm font-medium">{report.headline}</p>
          </div>
        </div>
      </div>

      {/* Profit gauge */}
      <ProfitGauge roc={report.rocPct} target={report.targetProfitPct ?? 15} verdict={report.verdict} />

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI label="רווח יזמי" value={fmtNIS(report.developerProfit)} highlight />
        <KPI label="ROC (רווח/עלות)" value={fmtPct(report.rocPct)} />
        <KPI label="ROS (רווח/מחזור)" value={fmtPct(report.rosPct)} />
        <KPI label="IRR משוער" value={fmtPct(report.irrPct)} />
      </div>


      {/* Cost / revenue breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        <BreakdownPanel
          title="הכנסות"
          rows={[
            ["פדיון ממכירות (כולל מע״מ)", fmtNIS(report.totalSalesRevenue)],
            ["נטו (ללא מע״מ)", fmtNIS(report.netSalesRevenue)],
          ]}
        />
        <BreakdownPanel
          title="עלויות"
          rows={[
            ["עלות בנייה (Hard)", fmtNIS(report.hardCosts)],
            ["Soft costs", fmtNIS(report.softCosts)],
            ...(report.treePreservationCost && report.treePreservationCost > 0
              ? [["עצים לשימור / כופר", fmtNIS(report.treePreservationCost)] as [string, string]]
              : []),
            ...(report.parkingBasementCost && report.parkingBasementCost > 0
              ? [["מרתפי חניה (תוספת)", fmtNIS(report.parkingBasementCost)] as [string, string]]
              : []),
            ...(report.dewateringCost && report.dewateringCost > 0
              ? [["השפלת מי תהום", fmtNIS(report.dewateringCost)] as [string, string]]
              : []),
            ["שווי קרקע", fmtNIS(report.landCost)],
            ["דיירים (פינוי+שכ״ד)", fmtNIS(report.tenantCosts)],
            ["היטל השבחה", fmtNIS(report.bettermentTax)],
            ["דמי היתר", fmtNIS(report.permitFees)],
            ["עלויות מימון", fmtNIS(report.financingCosts)],
            ["סה״כ עלות פרויקט", fmtNIS(report.totalProjectCost), true],
          ]}
        />
      </div>

      {/* Construction-cost breakdown */}
      <ConstructionBreakdownPanel report={report} />



      {/* Physical constraints impact */}
      {report.physicalConstraintsCost && report.physicalConstraintsCost > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">השפעת אילוצים פיזיים-רגולטוריים</h4>
            <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30">
              {((report.physicalConstraintsCost / report.totalProjectCost) * 100).toFixed(1)}% מסה״כ העלות
            </Badge>
          </div>
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <ConstraintCell label="עצים לשימור" value={report.treePreservationCost ?? 0} />
            <ConstraintCell label="מרתפי חניה" value={report.parkingBasementCost ?? 0} />
            <ConstraintCell label="השפלת מי תהום" value={report.dewateringCost ?? 0} />
          </div>
          <div className="mt-2 border-t border-amber-500/20 pt-2 text-xs">
            <span className="text-muted-foreground">סה״כ אילוצים: </span>
            <span className="font-semibold tabular-nums">{fmtNIS(report.physicalConstraintsCost)}</span>
          </div>
        </div>
      )}

      {/* Breakeven */}
      <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm">
        <span className="text-muted-foreground">נקודת איזון: </span>
        <span className="font-semibold">
          {Math.round(report.breakevenPricePerSqm).toLocaleString("he-IL")} ₪/מ״ר
        </span>
        <span className="text-xs text-muted-foreground"> — מתחת לזה הפרויקט מפסיד</span>
      </div>

      {/* Sensitivity */}
      <SensitivityTable report={report} />

      {/* Notes */}
      {report.notes?.length > 0 && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            הנחות עבודה והערות
          </h4>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {report.notes.map((n, i) => (
              <li key={i} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
};

const ConstructionBreakdownPanel = ({ report }: { report: FinancialReport }) => {
  const b = report.constructionBreakdown;
  if (!b) return null;
  const row = (label: string, value: string, sub?: string, bold?: boolean) => (
    <div className={`flex justify-between gap-2 text-sm ${bold ? "border-t pt-2 font-semibold" : ""}`}>
      <span className="text-muted-foreground">
        {label}
        {sub && <span className="ml-1 text-[10px] opacity-70">{sub}</span>}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">פירוט עלות בנייה (Hard)</h4>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {b.constructionMode === "addition_only" ? "חיזוק + תוספת" : "הריסה + בנייה מחדש"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            ממוצע {b.effectiveCostPerSqmBuilt.toLocaleString("he-IL")} ₪/מ״ר
          </Badge>
        </div>
      </div>

      {/* Area context */}
      <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg bg-muted/20 p-2 text-[11px]">
        <div>
          <div className="text-muted-foreground">שטח קיים</div>
          <div className="font-semibold tabular-nums">{b.existingBuiltAreaSqm.toLocaleString("he-IL")} מ״ר</div>
        </div>
        <div>
          <div className="text-muted-foreground">שטח מתווסף</div>
          <div className="font-semibold tabular-nums text-primary">+{b.addedBuiltAreaSqm.toLocaleString("he-IL")} מ״ר</div>
        </div>
        <div>
          <div className="text-muted-foreground">שטח מוצע סה״כ</div>
          <div className="font-semibold tabular-nums">{(b.existingBuiltAreaSqm + b.addedBuiltAreaSqm).toLocaleString("he-IL")} מ״ר</div>
        </div>
      </div>

      <div className="space-y-1.5">
        {row(
          b.constructionMode === "addition_only"
            ? `בנייה חדשה — תוספת מעל-קרקע (${b.aboveGroundAreaSqm.toLocaleString("he-IL")} מ״ר)`
            : `מעל-קרקע (${b.aboveGroundAreaSqm.toLocaleString("he-IL")} מ״ר)`,
          fmtNIS(b.aboveGroundCost),
          `× ${b.effectiveAboveGroundRate.toLocaleString("he-IL")} ₪ • גמר ×${b.finishMultiplier.toFixed(2)} • גובה ×${b.heightPremiumMultiplier.toFixed(2)} (${b.floorsAboveGround} קומות)`,
        )}
        {b.strengtheningCost > 0 &&
          row(
            `חיזוק קיים (${b.existingBuiltAreaSqm.toLocaleString("he-IL")} מ״ר)`,
            fmtNIS(b.strengtheningCost),
            `× ${b.strengtheningCostPerSqm.toLocaleString("he-IL")} ₪/מ״ר`,
          )}
        {b.basementAreaSqm > 0 &&
          row(
            `מרתפי חניה (${b.basementAreaSqm.toLocaleString("he-IL")} מ״ר)`,
            fmtNIS(b.basementCost),
            `× ${b.effectiveBasementRate.toLocaleString("he-IL")} ₪`,
          )}
        {b.demolitionCost > 0 && row("הריסת קיים", fmtNIS(b.demolitionCost))}
        {b.siteDevelopmentCost > 0 && row("פיתוח שטח", fmtNIS(b.siteDevelopmentCost))}
        {row("בסיס לפני אסקלציה", fmtNIS(b.baseHardCost), undefined, true)}
        {b.escalationCost > 0 &&
          row(
            "אסקלציה (אינפלציית בנייה)",
            `+${fmtNIS(b.escalationCost)}`,
            `×${b.escalationMultiplier.toFixed(3)}`,
          )}
        {b.contingencyCost > 0 &&
          row('בלת"מ', `+${fmtNIS(b.contingencyCost)}`, `${b.contingencyPct}%`)}
        {row('סה״כ Hard', fmtNIS(b.totalHardCost), undefined, true)}
      </div>
    </div>
  );
};

const ConstraintCell = ({ label, value }: { label: string; value: number }) => (
  <div className={`rounded-lg border px-3 py-2 ${value > 0 ? "border-amber-500/30 bg-card" : "border-muted bg-muted/20 opacity-60"}`}>
    <div className="text-[10px] text-muted-foreground">{label}</div>
    <div className="mt-0.5 text-sm font-semibold tabular-nums">{value > 0 ? fmtNIS(value) : "—"}</div>
  </div>
);

const KPI = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <div
    className={`rounded-xl border p-4 ${
      highlight ? "border-primary/30 bg-primary/5" : "bg-card"
    }`}
  >
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`mt-1 text-xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
  </div>
);

const BreakdownPanel = ({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string] | [string, string, boolean]>;
}) => (
  <div className="rounded-xl border bg-card p-4">
    <h4 className="mb-3 text-sm font-semibold">{title}</h4>
    <div className="space-y-1.5 text-sm">
      {rows.map(([label, value, bold], i) => (
        <div
          key={i}
          className={`flex justify-between gap-2 ${bold ? "border-t pt-2 font-semibold" : ""}`}
        >
          <span className="text-muted-foreground">{label}</span>
          <span className="tabular-nums">{value}</span>
        </div>
      ))}
    </div>
  </div>
);

const ProfitGauge = ({
  roc,
  target,
  verdict,
}: {
  roc: number;
  target: number;
  verdict: FinancialReport["verdict"];
}) => {
  const safeTarget = target > 0 ? target : 15;
  const gap = roc - safeTarget;
  // Scale bar to max(target*1.5, roc*1.1) so both fit
  const scaleMax = Math.max(safeTarget * 1.5, roc * 1.1, 1);
  const rocPos = Math.max(0, Math.min(100, (roc / scaleMax) * 100));
  const targetPos = Math.max(0, Math.min(100, (safeTarget / scaleMax) * 100));

  const tone =
    verdict === "profitable"
      ? { bar: "bg-success", text: "text-success", ring: "border-success/30 bg-success/5", label: "מעל הרף" }
      : verdict === "marginal"
      ? { bar: "bg-warning", text: "text-warning", ring: "border-warning/30 bg-warning/5", label: "סמוך לרף" }
      : { bar: "bg-destructive", text: "text-destructive", ring: "border-destructive/30 bg-destructive/5", label: "מתחת לרף" };

  const Icon = gap >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className={`rounded-2xl border p-5 ${tone.ring}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-card ${tone.text}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              רווח יזמי (ROC) מול רף המטרה
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className={`text-3xl font-bold tabular-nums ${tone.text}`}>{fmtPct(roc)}</span>
              <span className="text-sm text-muted-foreground">מתוך יעד {fmtPct(safeTarget)}</span>
            </div>
          </div>
        </div>
        <div className="text-left">
          <div className={`text-sm font-semibold tabular-nums ${tone.text}`}>
            {gap >= 0 ? "+" : ""}{gap.toFixed(1)}%
          </div>
          <div className="text-[11px] text-muted-foreground">{tone.label}</div>
        </div>
      </div>

      {/* Bar */}
      <div className="relative h-3 w-full overflow-visible rounded-full bg-muted">
        <div
          className={`absolute inset-y-0 right-0 rounded-full transition-all ${tone.bar}`}
          style={{ width: `${rocPos}%` }}
        />
        {/* Target marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2"
          style={{ right: `calc(${targetPos}% - 1px)` }}
        >
          <div className="h-5 w-0.5 bg-foreground/80" />
        </div>
      </div>

      {/* Scale legend */}
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{scaleMax.toFixed(0)}%</span>
        <span className="font-semibold text-foreground/70">↑ רף {safeTarget.toFixed(0)}%</span>
        <span>0%</span>
      </div>
    </div>
  );
};


const SensitivityTable = ({ report }: { report: FinancialReport }) => {
  const priceDeltas = [-5, 0, 5];
  const costDeltas = [-5, 0, 5];
  const cellFor = (p: number, c: number) =>
    report.sensitivity.find((s) => s.priceDelta === p && s.costDelta === c);

  const toneFor = (roc: number) =>
    roc < 0
      ? "bg-destructive/10 text-destructive"
      : roc < 10
      ? "bg-amber-500/10 text-amber-700"
      : roc < 18
      ? "bg-muted/40"
      : "bg-primary/10 text-primary font-semibold";

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">ניתוח רגישות (±5%)</h4>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="p-2 text-right">מחיר ↓ / עלות ←</th>
              {costDeltas.map((c) => (
                <th key={c} className="p-2 text-center">
                  {c > 0 ? `+${c}%` : `${c}%`} עלות
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {priceDeltas.map((p) => (
              <tr key={p} className="border-t">
                <td className="bg-muted/20 p-2 font-medium">
                  {p > 0 ? `+${p}%` : `${p}%`} מחיר
                </td>
                {costDeltas.map((c) => {
                  const cell = cellFor(p, c);
                  if (!cell) return <td key={c} className="p-2 text-center">—</td>;
                  return (
                    <td key={c} className={`p-2 text-center tabular-nums ${toneFor(cell.roc)}`}>
                      <div className="text-[11px]">{fmtNIS(cell.profit)}</div>
                      <div className="text-[10px] opacity-80">ROC {cell.roc.toFixed(1)}%</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
