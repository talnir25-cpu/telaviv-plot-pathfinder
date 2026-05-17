import type { FeasibilityReport, AnalysisInput } from "@/types/feasibility";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PlotMap } from "@/components/PlotMap";
import { FinancialAnalysis } from "@/components/FinancialAnalysis";
import {
  AlertTriangle,
  Building2,
  FileText,
  Info,
  Layers,
  RefreshCw,
  Ruler,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Coins,
  Map as MapIcon,
  LayoutDashboard,
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

const StatTile = ({
  icon: Icon,
  label,
  value,
  unit,
  accent,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) => (
  <div
    className={cn(
      "flex items-center gap-3 rounded-xl border bg-card p-3",
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
    <div className="min-w-0">
      <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-bold leading-tight">
        {value}
        {unit && <span className="mr-1 text-xs font-medium text-muted-foreground">{unit}</span>}
      </p>
    </div>
  </div>
);

const ComparisonRow = ({
  label,
  existing,
  proposed,
  unit,
}: {
  label: string;
  existing: string | number;
  proposed: string | number;
  unit?: string;
}) => (
  <tr className="border-b last:border-0">
    <td className="py-2.5 text-sm font-medium text-muted-foreground">{label}</td>
    <td className="py-2.5 text-sm">
      {existing}
      {unit && <span className="mr-1 text-muted-foreground">{unit}</span>}
    </td>
    <td className="py-2.5 text-sm font-semibold text-primary">
      {proposed}
      {unit && <span className="mr-1 text-muted-foreground">{unit}</span>}
    </td>
  </tr>
);

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

  return (
    <section className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Compact hero */}
      <Card className="overflow-hidden border-0 shadow-elegant">
        <div className="bg-gradient-hero p-5 text-primary-foreground">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-primary-foreground/70">
                דוח היתכנות • {plotLabel}
              </p>
              <h2 className="text-xl font-bold leading-tight md:text-2xl">{report.headline}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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

      {/* Dashboard tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">סקירה</span>
          </TabsTrigger>
          <TabsTrigger value="zoning" className="gap-1.5">
            <Ruler className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">זכויות</span>
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
          <TabsTrigger value="map" className="gap-1.5">
            <MapIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">מפה</span>
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-1.5">
            <Coins className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">פיננסי</span>
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Comparison */}
            <Card className="p-5 shadow-card lg:col-span-2">
              <div className="mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <h3 className="text-base font-bold">קיים מול מוצע</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        פרמטר
                      </th>
                      <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        קיים
                      </th>
                      <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-primary">
                        מוצע
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <ComparisonRow label="יחידות דיור" existing={fmt(report.existing.units)} proposed={fmt(report.proposed.units)} />
                    <ComparisonRow label="קומות" existing={fmt(report.existing.floors)} proposed={fmt(report.proposed.floors)} />
                    <ComparisonRow label="שטח בנוי" existing={fmt(report.existing.builtAreaSqm)} proposed={fmt(report.proposed.builtAreaSqm)} unit='מ"ר' />
                    <ComparisonRow label="FAR" existing={`${fmt(report.existing.far * 100)}%`} proposed={`${fmt(report.proposed.far * 100)}%`} />
                    <ComparisonRow label="גובה מקס׳" existing="—" proposed={fmt(report.proposed.heightMeters, 1)} unit="מ׳" />
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Committee summary */}
            <Card className="overflow-hidden border-0 shadow-elegant">
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

          {/* Stats row */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={TrendingUp} label="מכפיל יח״ד" value={`${fmt(report.metrics.multiplier, 2)}x`} accent />
            <StatTile icon={Building2} label="יח״ד נטו" value={fmt(report.metrics.newUnits)} />
            <StatTile icon={Layers} label="שטח מכירה" value={fmt(report.metrics.estimatedSellableArea)} unit='מ"ר' />
            <StatTile icon={Ruler} label="דירה ממוצעת" value={fmt(report.metrics.avgUnitSize)} unit='מ"ר' />
          </div>

          {report.sources.length > 0 && (
            <Card className="p-3 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  מקורות:
                </span>
                {report.sources.map((s, i) => (
                  <span key={i} className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
                    {s}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ZONING */}
        <TabsContent value="zoning" className="mt-4">
          <Card className="p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-primary" />
                <h3 className="text-base font-bold">זכויות בנייה ותקנון</h3>
              </div>
              <span className="text-[11px] text-muted-foreground">מקור: {report.zoning.source}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { label: "גובה מקס׳", value: `${fmt(report.zoning.maxHeightMeters, 1)} מ׳` },
                { label: "קומות מקס׳", value: fmt(report.zoning.maxFloors) },
                { label: "FAR מקס׳", value: `${fmt(report.zoning.maxFAR * 100)}%` },
                { label: "קו בניין קדמי", value: `${fmt(report.zoning.frontSetbackM, 1)} מ׳` },
                { label: "קו בניין צדדי", value: `${fmt(report.zoning.sideSetbackM, 1)} מ׳` },
                { label: "קו בניין אחורי", value: `${fmt(report.zoning.rearSetbackM, 1)} מ׳` },
              ].map((it) => (
                <div key={it.label} className="rounded-lg border bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground">{it.label}</p>
                  <p className="mt-1 text-base font-semibold">{it.value}</p>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* RISKS */}
        <TabsContent value="risks" className="mt-4">
          <Card className="p-5 shadow-card">
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
        </TabsContent>

        {/* MAP */}
        <TabsContent value="map" className="mt-4">
          <PlotMap gush={gush} helka={helka} />
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
