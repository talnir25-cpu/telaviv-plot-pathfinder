
import { useState } from "react";
import type { FeasibilityReport, AnalysisInput } from "@/types/feasibility";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { KpiHeader } from "@/components/KpiHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { PlotMap } from "@/components/PlotMap";
import { FinancialAnalysis } from "@/components/FinancialAnalysis";
import {
  AlertTriangle,
  Building2,
  Info,
  Layers,
  RefreshCw,
  Ruler,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Coins,
  MapPin,
  BookOpen,
  CheckCircle2,
  XCircle,
  Database,
  Brain,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  report: FeasibilityReport;
  plotLabel: string;
  gush: number;
  helka: number;
  input: AnalysisInput;
  onRefresh?: () => void;
  refreshing?: boolean;
}

const STATUS_STYLES: Record<FeasibilityReport["status"], { bg: string; ring: string; dot: string; label: string }> = {
  high_potential: { bg: "bg-gradient-success text-success-foreground", ring: "ring-success/30", dot: "bg-success-foreground", label: "פוטנציאל גבוה" },
  medium_potential: { bg: "bg-gradient-warning text-warning-foreground", ring: "ring-warning/30", dot: "bg-warning-foreground", label: "פוטנציאל בינוני" },
  high_risk: { bg: "bg-gradient-danger text-danger-foreground", ring: "ring-danger/30", dot: "bg-danger-foreground", label: "סיכון גבוה" },
  blocked: { bg: "bg-gradient-danger text-danger-foreground", ring: "ring-danger/30", dot: "bg-danger-foreground", label: "חסום" },
};

const FLAG_STYLES = {
  critical: { bg: "bg-danger/10", border: "border-danger/40", text: "text-danger", icon: ShieldAlert },
  warning: { bg: "bg-warning/10", border: "border-warning/40", text: "text-warning", icon: AlertTriangle },
  info: { bg: "bg-primary/5", border: "border-primary/30", text: "text-primary", icon: Info },
} as const;

const fmt = (n: number, d = 0) =>
  Number.isFinite(n) ? n.toLocaleString("he-IL", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

const SourceBadge = ({ source }: { source: string }) => (
  <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`מקור: ${source}`}
          className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary/80 hover:bg-primary/10 hover:text-primary transition-colors"
        >
          <BookOpen className="h-3 w-3" />
          <span className="max-w-[140px] truncate">{source}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-right" dir="rtl">
        <p className="text-xs"><span className="font-semibold">מראה מקום: </span>{source}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

const StatTile = ({
  icon: Icon,
  label,
  value,
  unit,
  accent,
  source,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
  source?: string;
}) => (
  <div
    className={cn(
      "flex items-start gap-3 rounded-xl border bg-card p-3",
      accent && "border-primary/30 bg-primary/5"
    )}
  >
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
        accent ? "bg-gradient-hero text-primary-foreground" : "bg-primary/10 text-primary"
      )}
    >
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-bold leading-tight">
        {value}
        {unit && <span className="me-1 text-xs font-medium text-muted-foreground">{unit}</span>}
      </p>
      {source && <SourceBadge source={source} />}
    </div>
  </div>
);

const ComparisonRow = ({
  label,
  existing,
  proposed,
  unit,
  badge,
}: {
  label: string;
  existing: string | number;
  proposed: string | number;
  unit?: string;
  badge?: React.ReactNode;
}) => (
  <tr>
    <td className="border-b border-border/60 py-3 text-right text-sm font-medium text-muted-foreground">
      <div className="flex items-center justify-start gap-2">
        {badge}
        <span>{label}</span>
      </div>
    </td>
    <td className="w-32 border-b border-border/60 py-3 text-center text-sm tabular-nums">
      {existing}
      {unit && existing !== "—" && <span className="me-1 text-muted-foreground">{unit}</span>}
    </td>
    <td className="w-32 border-b border-border/60 py-3 text-center text-sm font-semibold tabular-nums text-primary">
      {proposed}
      {unit && <span className="me-1 text-muted-foreground">{unit}</span>}
    </td>
  </tr>
);

const BUILT_AREA_SOURCE_LABEL: Record<string, string> = {
  manual: "מאומת",
  tlv_permits: 'היתר ת"א',
  govmap_bldg: "GovMap",
  nadlan: 'נדל"ן',
  heuristic: "אומדן",
};

const SourcesDialog = ({
  report,
  input,
  gush,
  helka,
}: {
  report: FeasibilityReport;
  input: AnalysisInput;
  gush: number;
  helka: number;
}) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="border-0 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
      >
        <BookOpen className="h-4 w-4" />
        מקורות
      </Button>
    </DialogTrigger>
    <DialogContent dir="rtl" className="max-w-3xl text-right max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          על מה מבוססות התובנות
        </DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">
        שקיפות מלאה על מקורות הנתונים, ההיוריסטיקה וההנחות. כל החלטת השקעה
        מחייבת אימות בתיק מהנדס העיר.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-success/30 bg-success/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <h4 className="font-semibold text-success">מסמכי תכנון רשמיים</h4>
          </div>
          <ul className="space-y-2 text-sm">
            <li>
              <span className="font-medium">תקנון רובע {input.quarter}</span>
              <span className="text-muted-foreground"> — זכויות, גובה, קווי בניין, צפיפות.</span>
            </li>
            <li>
              <span className="font-medium">תכנית מתאר תא/5000</span>
              <span className="text-muted-foreground"> — ייעודי קרקע, מגבלות אזוריות, מתחמי שימור.</span>
            </li>
            <li>
              <span className="font-medium">מדיניות חניה — עיריית ת״א</span>
              <span className="text-muted-foreground"> — תקני חניה ליח״ד והקלות תח״צ.</span>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <h4 className="font-semibold text-primary">נתוני חלקה חיים</h4>
          </div>
          <ul className="space-y-2 text-sm">
            <li>
              <span className="font-medium">GovMap / נסח טאבו</span>
              <span className="text-muted-foreground"> — גוש {gush}, חלקה {helka}, שטח מגרש.</span>
            </li>
            <li>
              <span className="font-medium">קלט משתמש</span>
              <span className="text-muted-foreground"> — יח״ד קיימות ({input.existingUnits}), קומות ({input.existingFloors}), שימור ({input.conservation ? "כן" : "לא"}).</span>
            </li>
            <li>
              <span className="font-medium">Cache פנימי</span>
              <span className="text-muted-foreground"> — נתוני חלקות שכבר נשלפו, לשיפור מהירות.</span>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Brain className="h-4 w-4 text-warning" />
            <h4 className="font-semibold text-warning">ידע שוק מובנה ב-AI</h4>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">
            משמש לניתוח פיננסי, מבוסס על נתוני שוק 2026 ברובעים 3-4:
          </p>
          <ul className="space-y-1 text-xs">
            <li>• מכירה: 50,000–75,000 ₪/מ״ר</li>
            <li>• בנייה: 8,500–11,000 ₪/מ״ר</li>
            <li>• ריבית: 6–7.5% • הקמה: 24–36 חודשים</li>
            <li>• שכ״ד דייר: 7,000–10,000 ₪/חודש</li>
            <li>• פינוי: 25,000–40,000 ₪/דייר</li>
            <li>• היטל השבחה: 50% משווי השבחה</li>
            <li>• שווי קרקע: 35,000–55,000 ₪/מ״ר זכויות</li>
          </ul>
        </div>

        <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <XCircle className="h-4 w-4 text-danger" />
            <h4 className="font-semibold text-danger">מה לא מקור רשמי כרגע</h4>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="text-muted-foreground">
              אין חיבור חי לתיק מהנדס העיר או למערכת רישוי זמין.
            </li>
            <li className="text-muted-foreground">
              אין משיכה אוטומטית של תב״עות נקודתיות החלות על החלקה.
            </li>
            <li className="text-muted-foreground">
              אין שאילתת עסקאות חיה מרשות המסים (מדד מחירי דירות).
            </li>
            <li className="text-muted-foreground">
              מכפילי תמ״א / פינוי-בינוי מבוססים על ידע ה-LLM, לא על מסמך מצוטט.
            </li>
          </ul>
        </div>
      </div>

      {report.sources.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            מקורות שצוטטו על-ידי המודל לחלקה זו
          </p>
          <div className="flex flex-wrap gap-2">
            {report.sources.map((s, i) => (
              <span key={i} className="rounded-full bg-card px-2.5 py-1 text-[11px] text-foreground border">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </DialogContent>
  </Dialog>
);

const CalculationSourceCard = ({ report }: { report: FeasibilityReport }) => {
  const src = report.calculationSource;
  if (!src) return null;

  if (src.method === "regulation") {
    const confColor =
      src.confidence === "high"
        ? "border-success/40 bg-success/5"
        : src.confidence === "medium"
        ? "border-primary/40 bg-primary/5"
        : "border-warning/40 bg-warning/10";
    const confLabel =
      src.confidence === "high" ? "ייעוד מאומת" : src.confidence === "medium" ? "ייעוד סביר" : "ייעוד ברירת מחדל — אשר ידנית";
    return (
      <Card dir="rtl" className={cn("p-4 text-right border", confColor)}>
        <div className="mb-2 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold">מקור החישוב</h3>
          <span className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-medium">{confLabel}</span>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">תכנית: </span>
            <span className="font-semibold">{src.plan_code}</span>
          </div>
          <div>
            <span className="text-muted-foreground">ייעוד: </span>
            <span className="font-semibold">{src.zone_label}</span>
          </div>
          <div>
            <span className="text-muted-foreground">סך זכויות (FAR): </span>
            <span className="font-semibold tabular-nums">
              {src.base_far_pct}%
              {src.far_bonus_pct > 0 && (
                <span className="text-success"> +{src.far_bonus_pct}% ({src.renewal_track_label})</span>
              )}
              {" "}= {src.effective_far_pct}%
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">מקדם צפיפות: </span>
            <span className="font-semibold tabular-nums">{src.density_coefficient_sqm_per_unit} מ"ר/יח"ד</span>
            {src.units_bonus_pct > 0 && (
              <span className="text-success"> · בונוס יח"ד +{src.units_bonus_pct}%</span>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">מקס' קומות: </span>
            <span className="font-semibold tabular-nums">{src.max_floors}</span>
          </div>
          <div>
            <span className="text-muted-foreground">ציטוט: </span>
            <span className="font-medium">{src.source_citation}</span>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          חישוב יח"ד: ⌊שטח מגרש × FAR אפקטיבי ÷ מקדם צפיפות⌋ × (1 + בונוס יח"ד)
        </p>
      </Card>
    );
  }

  return (
    <Card dir="rtl" className="p-4 text-right border border-warning/40 bg-warning/10">
      <div className="mb-1 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <h3 className="text-sm font-bold">מקור החישוב: הערכת AI</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {src.note} · מסלול: {src.renewal_track_label} · מכפיל יח"ד: {src.multiplier_used}×
      </p>
    </Card>
  );
};

export const DashboardReport = ({
  report,
  plotLabel,
  gush,
  helka,
  input,
  onRefresh,
  refreshing,
}: Props) => {
  const status = STATUS_STYLES[report.status];
  const plotArea = input.area ?? input.shapeArea ?? 0;
  const [coverageBasis, setCoverageBasis] = useState<"planning" | "existing">("planning");
  const hasExistingCoverage = report.zoning.coverageExistingPct != null;

  return (
    <section dir="rtl" className="space-y-4 text-right animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Compact hero */}
      <Card dir="rtl" className="overflow-hidden border-0 shadow-elegant text-right">
        <div className="bg-gradient-hero p-5 text-primary-foreground">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-primary-foreground/70">
                דוח היתכנות • {plotLabel}
              </p>
              <h2 className="text-xl font-bold leading-tight md:text-2xl">{report.headline}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SourcesDialog report={report} input={input} gush={gush} helka={helka} />
              {onRefresh && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="border-0 bg-primary-foreground/15 text-primary-foreground hover:bg-primary-foreground/25"
                >
                  <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                  {refreshing ? "מרענן..." : "רענן"}
                </Button>
              )}
              <div
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-2",
                  status.bg,
                  status.ring
                )}
              >
                <span className={cn("h-2 w-2 animate-pulse rounded-full", status.dot)} />
                {report.statusLabel || status.label}
              </div>
            </div>
          </div>

          {/* KPI strip */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "מכפיל יח״ד", value: `${fmt(report.metrics.multiplier, 2)}x` },
              { label: "יח״ד חדשות", value: fmt(report.metrics.newUnits) },
              { label: "שטח מכירה", value: `${fmt(report.metrics.estimatedSellableArea)} מ"ר` },
              { label: "ממוצע דירה", value: `${fmt(report.metrics.avgUnitSize)} מ"ר` },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded-lg bg-primary-foreground/10 px-3 py-2 backdrop-blur"
              >
                <div className="text-[10px] uppercase tracking-wider text-primary-foreground/70">
                  {k.label}
                </div>
                <div className="text-base font-bold">{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* KPI Header — מכפילי כדאיות מרכזיים */}
      <KpiHeader report={report} />

      {/* Dashboard tabs — narrative flow: parcel → zoning → proposed → risks → financial */}
      <Tabs defaultValue="parcel" className="w-full">
        <TabsList dir="rtl" className="grid w-full grid-cols-5">
          <TabsTrigger value="parcel" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">חלקה</span>
          </TabsTrigger>
          <TabsTrigger value="zoning" className="gap-1.5">
            <Ruler className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">זכויות</span>
          </TabsTrigger>
          <TabsTrigger value="proposed" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">תכנון מוצע</span>
          </TabsTrigger>
          <TabsTrigger value="risks" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">סיכונים</span>
            {report.redFlags.length > 0 && (
              <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-danger-foreground">
                {report.redFlags.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-1.5">
            <Coins className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">פיננסי</span>
          </TabsTrigger>
        </TabsList>

        {/* PARCEL — map + GIS facts */}
        <TabsContent value="parcel" className="mt-4 space-y-4">
          <PlotMap gush={gush} helka={helka} />
          <Card dir="rtl" className="p-5 shadow-card text-right">
            <div className="mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              <h3 className="text-base font-bold">נתוני חלקה</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                icon={MapPin}
                label="גוש / חלקה"
                value={`${gush} / ${helka}`}
                source="GovMap / נסח טאבו"
              />
              <StatTile
                icon={Ruler}
                label="שטח מגרש"
                value={plotArea > 0 ? fmt(plotArea) : "—"}
                unit={plotArea > 0 ? 'מ"ר' : undefined}
                source={input.shapeArea ? "GIS עיריית ת״א — שכבת חלקות" : "נסח טאבו / קלט משתמש"}
              />
              <StatTile
                icon={Building2}
                label="יח״ד קיימות"
                value={fmt(report.existing.units)}
                source="קלט משתמש / נסח טאבו"
              />
              <StatTile
                icon={Layers}
                label="קומות קיימות"
                value={fmt(report.existing.floors)}
                source="קלט משתמש / סקר שטח"
              />
              <StatTile
                icon={Layers}
                label="שטח בנוי קיים"
                value={fmt(report.existing.builtAreaSqm)}
                unit='מ"ר'
                source={
                  input.existingBuiltAreaSource
                    ? BUILT_AREA_SOURCE_LABEL[input.existingBuiltAreaSource] ?? input.existingBuiltAreaSource
                    : "אומדן"
                }
              />
              <StatTile
                icon={TrendingUp}
                label="FAR קיים"
                value={`${fmt(report.existing.far * 100)}%`}
                source="חישוב: שטח בנוי ÷ שטח מגרש"
              />
              <div className="flex items-start gap-3 rounded-xl border bg-card p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Info className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    מקור שטח בנוי
                  </p>
                  <p className="text-sm font-semibold leading-tight">
                    {input.existingBuiltAreaSource
                      ? BUILT_AREA_SOURCE_LABEL[input.existingBuiltAreaSource] ?? input.existingBuiltAreaSource
                      : "—"}
                  </p>
                  <SourceBadge source="שדה existingBuiltAreaSource בקלט הניתוח" />
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border bg-card p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    שימור
                  </p>
                  <p className="text-sm font-semibold leading-tight">
                    {input.conservationDetails?.level
                      ? `שימור ${input.conservationDetails.level}`
                      : input.conservation
                      ? "כן"
                      : "לא"}
                  </p>
                  {input.conservationDetails?.buildingName && (
                    <p className="truncate text-[10px] text-muted-foreground" title={input.conservationDetails.buildingName}>
                      {input.conservationDetails.buildingName}
                      {input.conservationDetails.planRef ? ` · ${input.conservationDetails.planRef}` : ""}
                    </p>
                  )}
                  <SourceBadge source="רשימת שימור עיריית ת״א (תא/2650/ב)" />
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* ZONING — rights, setbacks, coverage, renewal potential */}
        <TabsContent value="zoning" className="mt-4">
          <Card dir="rtl" className="p-5 shadow-card text-right">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-primary" />
                <h3 className="text-base font-bold">זכויות בנייה ותקנון</h3>
              </div>
              <span className="text-[11px] text-muted-foreground">מקור: {report.zoning.source}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: "גובה מקס׳", value: `${fmt(report.zoning.maxHeightMeters, 1)} מ׳`, source: `תקנון רובע ${input.quarter} · ${report.zoning.source}` },
                { label: "קומות מקס׳", value: fmt(report.zoning.maxFloors), source: `תקנון רובע ${input.quarter} · ${report.zoning.source}` },
                { label: "FAR מקס׳", value: `${fmt(report.zoning.maxFAR * 100)}%`, source: `תקנון רובע ${input.quarter} · ${report.zoning.source}` },
                { label: "קו בניין קדמי", value: `${fmt(report.zoning.frontSetbackM, 1)} מ׳`, source: report.zoning.setbackSource === "manual" || report.zoning.setbackSource === "manual_override" ? "הזנת משתמש" : `תקנון רובע ${input.quarter} (תא/${input.quarter === 3 ? "3616/א" : "3729/א"})` },
                { label: "קו בניין צדדי", value: `${fmt(report.zoning.sideSetbackM, 1)} מ׳`, source: report.zoning.setbackSource === "manual" || report.zoning.setbackSource === "manual_override" ? "הזנת משתמש" : `תקנון רובע ${input.quarter} (תא/${input.quarter === 3 ? "3616/א" : "3729/א"})` },
                { label: "קו בניין אחורי", value: `${fmt(report.zoning.rearSetbackM, 1)} מ׳`, source: report.zoning.setbackSource === "manual" || report.zoning.setbackSource === "manual_override" ? "הזנת משתמש" : `תקנון רובע ${input.quarter} (תא/${input.quarter === 3 ? "3616/א" : "3729/א"})` },
              ].map((it) => (
                <div key={it.label} className="rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground">{it.label}</p>
                  <p className="mt-1 text-base font-semibold">{it.value}</p>
                  <SourceBadge source={it.source} />
                </div>
              ))}
            </div>

            {/* תכסית וניצול */}
            {report.zoning.typicalFloorAreaSqm != null && report.zoning.typicalFloorAreaSqm > 0 && (() => {
              const floorsNeeded = report.zoning.floorsNeededForFAR ?? 0;
              const proposedFloors = report.proposed.floors;
              const maxFloorsVal = report.zoning.maxFloors;
              const isBlocked = floorsNeeded > maxFloorsVal;
              const isMismatch = !isBlocked && floorsNeeded > proposedFloors;
              const isOk = !isBlocked && !isMismatch;
              const statusIcon = isBlocked ? "✕" : isMismatch ? "⚠" : "✓";
              const statusColor = isBlocked
                ? "text-destructive"
                : isMismatch
                ? "text-amber-600 dark:text-amber-500"
                : "text-emerald-600 dark:text-emerald-500";
              const srcLabel = report.zoning.setbackSource === "manual" || report.zoning.setbackSource === "manual_override"
                ? "הזנת משתמש"
                : "תקנון רובע";
              return (
                <div className="mt-5 border-t pt-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      תכסית וניצול
                    </p>
                    <div className="flex items-center gap-2">
                      <ToggleGroup
                        type="single"
                        size="sm"
                        value={coverageBasis}
                        onValueChange={(v) => v && setCoverageBasis(v as "planning" | "existing")}
                        className="h-7"
                      >
                        <ToggleGroupItem value="planning" className="h-7 px-2 text-[11px]">
                          מעטפת תכנונית
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="existing"
                          disabled={!hasExistingCoverage}
                          className="h-7 px-2 text-[11px]"
                        >
                          תכסית קיימת
                        </ToggleGroupItem>
                      </ToggleGroup>
                      <span className="text-[10px] text-muted-foreground">מקור קווי בניין: {srcLabel}</span>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {coverageBasis === "planning" ? (
                    <div className="rounded-lg border bg-muted/30 px-4 py-3">
                        <p className="text-xs text-muted-foreground">שטח עיקרי מרבי לקומה</p>
                        <p className="mt-1 text-base font-semibold">
                          {fmt(report.zoning.typicalFloorAreaSqm)} מ״ר
                          <span className="me-2 text-xs font-normal text-muted-foreground">
                            (תכסית תכנונית {fmt(report.zoning.coveragePct ?? 0)}%)
                          </span>
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                          קירוב מלבני המבוסס על קווי הבניין (חזית/צד/אחור).
                        </p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground/90">
                          <span className="font-semibold">לפי מעטפת תכנונית — קלט לחישוב מס׳ קומות:</span> סך שטח בנייה מותר ÷ שטח קומה.
                        </p>
                        <SourceBadge source={`חישוב מקווי בניין · ${srcLabel}`} />
                      </div>
                    ) : (
                      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                        <div className="mb-1 flex items-center justify-between">
                          <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                            <Database className="h-3.5 w-3.5" />
                            תכסית קיימת (GIS עירוני)
                          </p>
                          {(report.zoning.coverageExistingPct ?? 0) > (report.zoning.coveragePct ?? 0) + 5 && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                              חריגה היסטורית
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-base font-semibold text-primary">
                          {fmt(report.zoning.coverageExistingPct ?? 0)}%
                          {report.zoning.buildingFootprintSqm != null && (
                            <span className="me-2 text-xs font-normal text-muted-foreground">
                              · שטח מבנה: {fmt(report.zoning.buildingFootprintSqm)} מ״ר
                            </span>
                          )}
                        </p>
                        <SourceBadge source={report.zoning.coverageSource ?? "GIS עיריית תל אביב — שכבות 524/513"} />
                      </div>
                    )}
                    <div className="rounded-lg border bg-muted/30 px-4 py-3">
                      <p className="text-xs text-muted-foreground">קומות נדרשות / מוצע</p>
                      <p className={`mt-1 text-base font-semibold ${statusColor}`}>
                        {fmt(floorsNeeded)} / {fmt(proposedFloors)} <span className="me-1">{statusIcon}</span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {isOk
                          ? "תכנון ריאלי בהינתן התכסית"
                          : isMismatch
                          ? "נדרשות יותר קומות לתמיכה בשטח המוצע"
                          : `חריגה ממקסימום ${fmt(maxFloorsVal)} קומות`}
                      </p>
                      <SourceBadge source="חישוב: שטח מגרש × FAR ÷ שטח קומה טיפוסי" />
                    </div>
                  </div>
                  {report.zoning.coverageExistingPct != null && (() => {
                    const exist = report.zoning.coverageExistingPct;
                    const planning = report.zoning.coveragePct ?? 0;
                    const overshoot = exist > planning + 5;
                    return (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {coverageBasis === "planning" && (
                          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                            <div className="mb-1 flex items-center justify-between">
                              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                                <Database className="h-3.5 w-3.5" />
                                תכסית קיימת (GIS עירוני)
                              </p>
                              {overshoot && (
                                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                                  חריגה היסטורית
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-base font-semibold text-primary">
                              {fmt(exist)}%
                              {report.zoning.buildingFootprintSqm != null && (
                                <span className="me-2 text-xs font-normal text-muted-foreground">
                                  · שטח מבנה: {fmt(report.zoning.buildingFootprintSqm)} מ״ר
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {report.zoning.coverageSource ?? "GIS עיריית תל אביב — שכבות 524/513"}
                            </p>
                          </div>
                        )}
                        <div className={`rounded-lg border bg-muted/30 px-4 py-3 ${coverageBasis === "existing" ? "sm:col-span-2" : ""}`}>
                          <p className="text-xs text-muted-foreground">פער מול המעטפת התכנונית</p>
                          <p className={`mt-1 text-base font-semibold ${overshoot ? "text-amber-600 dark:text-amber-500" : "text-emerald-600 dark:text-emerald-500"}`}>
                            {exist > planning ? "+" : ""}{fmt(exist - planning, 1)}%
                          </p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {overshoot
                              ? "המבנה הקיים חורג מקווי הבניין — בדיקה משפטית"
                              : "המבנה הקיים בתוך המעטפת הסטטוטורית"}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      <span className="font-semibold text-foreground">חישוב מספר הקומות הנדרשות מסתמך תמיד על המעטפת התכנונית</span> (קווי הבניין), ללא קשר למצב המתג. תכסית קיימת משמשת להשוואה ולזיהוי חריגות בלבד.
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* פוטנציאל הגדלת תכסית בהליך התחדשות */}
            {report.zoning.renewalPotential && (() => {
              const rp = report.zoning.renewalPotential;
              return (
                <div className="mt-5 border-t pt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                      פוטנציאל הגדלת תכסית בהליך התחדשות
                    </p>
                    <span className="text-[10px] text-muted-foreground">{rp.source}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                      <p className="text-xs text-muted-foreground">מסלול</p>
                      <p className="mt-1 text-sm font-semibold">{rp.trackLabel}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 px-4 py-3">
                      <p className="text-xs text-muted-foreground">תכסית בהתחדשות</p>
                      <p className="mt-1 text-base font-semibold text-primary">
                        {fmt(rp.typicalFloorAreaSqm)} מ״ר
                        <span className="me-2 text-xs font-normal text-muted-foreground">
                          ({fmt(rp.coveragePct)}%)
                        </span>
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 px-4 py-3">
                      <p className="text-xs text-muted-foreground">תוספת לקומה</p>
                      <p className="mt-1 text-base font-semibold text-emerald-600 dark:text-emerald-500">
                        +{fmt(rp.upliftSqmPerFloor)} מ״ר
                        <span className="me-2 text-xs font-normal text-muted-foreground">
                          (+{fmt(rp.upliftPct)}%)
                        </span>
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/30 px-4 py-3">
                      <p className="text-xs text-muted-foreground">תוספת אפקטיבית סה״כ</p>
                      <p className="mt-1 text-base font-semibold">
                        {fmt(rp.effectiveUpliftSqmTotal)} מ״ר
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        מקדם מימוש {fmt(rp.realizationFactor * 100)}%
                      </p>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    קווי בניין מוקלים: קדמי {rp.frontSetbackM} / צדדי {rp.sideSetbackM} / אחורי {rp.rearSetbackM} מ׳ •
                    חלק הדיירים בתמורה: {rp.tenantShareOfUpliftPct}%
                  </p>
                </div>
              );
            })()}
          </Card>
        </TabsContent>

        {/* PROPOSED — existing vs proposed, multipliers, committee */}
        <TabsContent value="proposed" className="mt-4 space-y-4">
          <CalculationSourceCard report={report} />
          <div className="grid gap-4 lg:grid-cols-3">

            <Card dir="rtl" className="p-5 shadow-card text-right lg:col-span-2">
              <div className="mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <h3 className="text-base font-bold">קיים מול מוצע</h3>
              </div>
              <div className="overflow-x-auto">
                <table dir="rtl" className="w-full border-separate border-spacing-x-6 border-spacing-y-0">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="border-b-2 border-border pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        פרמטר
                      </th>
                      <th className="w-32 border-b-2 border-border pb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        קיים
                      </th>
                      <th className="w-32 border-b-2 border-border pb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-primary">
                        מוצע
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <ComparisonRow label="יחידות דיור" existing={fmt(report.existing.units)} proposed={fmt(report.proposed.units)} />
                    <ComparisonRow label="קומות" existing={fmt(report.existing.floors)} proposed={fmt(report.proposed.floors)} />
                    <ComparisonRow
                      label="שטח בנוי"
                      existing={fmt(report.existing.builtAreaSqm)}
                      proposed={fmt(report.proposed.builtAreaSqm)}
                      unit='מ"ר'
                      badge={input.existingBuiltAreaSource ? (
                        <Badge variant="outline" className="text-[10px]">
                          {BUILT_AREA_SOURCE_LABEL[input.existingBuiltAreaSource] ?? input.existingBuiltAreaSource}
                        </Badge>
                      ) : undefined}
                    />
                    <ComparisonRow label="FAR" existing={`${fmt(report.existing.far * 100)}%`} proposed={`${fmt(report.proposed.far * 100)}%`} />
                    <ComparisonRow label="גובה מקס׳" existing="—" proposed={fmt(report.proposed.heightMeters, 1)} unit="מ׳" />
                  </tbody>
                </table>
              </div>
            </Card>

            <Card dir="rtl" className="overflow-hidden border-0 shadow-elegant text-right">
              <div className="flex h-full flex-col bg-gradient-hero p-5 text-primary-foreground">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <h3 className="text-base font-bold">סיכום לוועדה</h3>
                </div>
                <p className="text-sm leading-relaxed text-primary-foreground/90">
                  {report.committeeSummary}
                </p>
              </div>
            </Card>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={TrendingUp} label="מכפיל יח״ד" value={`${fmt(report.metrics.multiplier, 2)}x`} accent />
            <StatTile icon={Building2} label="יח״ד נטו" value={fmt(report.metrics.newUnits)} />
            <StatTile icon={Layers} label="שטח מכירה" value={fmt(report.metrics.estimatedSellableArea)} unit='מ"ר' />
            <StatTile icon={Ruler} label="דירה ממוצעת" value={fmt(report.metrics.avgUnitSize)} unit='מ"ר' />
          </div>
        </TabsContent>

        {/* RISKS — red flags + physical constraints */}
        <TabsContent value="risks" className="mt-4 space-y-4">
          <Card dir="rtl" className="p-5 shadow-card text-right">
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-danger" />
              <h3 className="text-base font-bold">דגלים אדומים וסיכונים</h3>
            </div>
            {report.redFlags.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                לא זוהו דגלים אדומים בחלקה זו.
              </p>
            ) : (
              <div className="space-y-3">
                {report.redFlags.map((flag, i) => {
                  const s = FLAG_STYLES[flag.level];
                  const Icon = s.icon;
                  return (
                    <div key={i} className={cn("flex gap-3 rounded-lg border p-4", s.bg, s.border)}>
                      <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", s.text)} />
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className={cn("font-semibold", s.text)}>{flag.title}</p>
                          <span className="text-[11px] text-muted-foreground">{flag.source}</span>
                        </div>
                        <p className="text-sm text-foreground/80">{flag.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* אילוצים פיזיים-רגולטוריים */}
          <Card dir="rtl" className="p-5 shadow-card text-right">
            <div className="mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h3 className="text-base font-bold">אילוצים פיזיים-רגולטוריים</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  label: "עצים בחלקה / לשימור",
                  value:
                    report.zoning.treesOnPlot != null
                      ? `${fmt(report.zoning.treesOnPlot)} / ${fmt(report.zoning.treesForConservation ?? 0)}`
                      : "נדרש סקר עצים",
                  hint: "פקודת היערות — כופר/העתקה",
                },
                {
                  label: "תקן חניה ליח״ד",
                  value:
                    report.zoning.parkingStandardPerUnit != null
                      ? `${fmt(report.zoning.parkingStandardPerUnit, 2)} מק׳${report.zoning.todReliefApplies ? " (הקלת TOD)" : ""}`
                      : "טעון בדיקה",
                  hint: "מדיניות חניה ת״א",
                },
                {
                  label: "מרתפי חניה נדרשים",
                  value:
                    report.zoning.requiredBasementFloors != null
                      ? `${fmt(report.zoning.requiredBasementFloors)} קומות`
                      : "—",
                  hint: "~25 מק׳ לקומת מרתף",
                },
                {
                  label: "עומק מי תהום משוער",
                  value:
                    report.zoning.groundwaterDepthM != null
                      ? `${fmt(report.zoning.groundwaterDepthM, 1)} מ׳`
                      : "טעון קידוח ניסיון",
                  hint: "תכנית מרתפים ת״א",
                },
                {
                  label: "השפלת מי תהום",
                  value:
                    report.zoning.dewateringRequired == null
                      ? "—"
                      : report.zoning.dewateringRequired
                      ? "נדרשת"
                      : "לא נדרשת",
                  hint: "רישוי רשות המים",
                },
              ].map((it) => (
                <div key={it.label} className="rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground">{it.label}</p>
                  <p className="mt-1 text-base font-semibold">{it.value}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{it.hint}</p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* FINANCIAL */}
        <TabsContent value="financial" className="mt-4">
          <FinancialAnalysis
            plot={{
              gush,
              helka,
              quarter: input.quarter,
              area: input.area ?? input.shapeArea ?? 0,
            }}
            planning={report}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
};
