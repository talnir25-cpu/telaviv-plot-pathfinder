import type { FeasibilityReport } from "@/types/feasibility";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlotMap } from "@/components/PlotMap";
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  FileText,
  Info,
  Layers,
  RefreshCw,
  Ruler,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  report: FeasibilityReport;
  plotLabel: string;
  gush: number;
  helka: number;
  onRefresh?: () => void;
  refreshing?: boolean;
}

const STATUS_STYLES: Record<
  FeasibilityReport["status"],
  { bg: string; ring: string; dot: string; label: string }
> = {
  high_potential: {
    bg: "bg-gradient-success text-success-foreground",
    ring: "ring-success/30",
    dot: "bg-success-foreground",
    label: "פוטנציאל גבוה",
  },
  medium_potential: {
    bg: "bg-gradient-warning text-warning-foreground",
    ring: "ring-warning/30",
    dot: "bg-warning-foreground",
    label: "פוטנציאל בינוני",
  },
  high_risk: {
    bg: "bg-gradient-danger text-danger-foreground",
    ring: "ring-danger/30",
    dot: "bg-danger-foreground",
    label: "סיכון גבוה",
  },
  blocked: {
    bg: "bg-gradient-danger text-danger-foreground",
    ring: "ring-danger/30",
    dot: "bg-danger-foreground",
    label: "חסום",
  },
};

const FLAG_STYLES: Record<
  "critical" | "warning" | "info",
  { bg: string; border: string; text: string; icon: typeof ShieldAlert }
> = {
  critical: {
    bg: "bg-danger/10",
    border: "border-danger/40",
    text: "text-danger",
    icon: ShieldAlert,
  },
  warning: {
    bg: "bg-warning/10",
    border: "border-warning/40",
    text: "text-warning",
    icon: AlertTriangle,
  },
  info: {
    bg: "bg-primary/5",
    border: "border-primary/30",
    text: "text-primary",
    icon: Info,
  },
};

const fmt = (n: number, digits = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("he-IL", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "—";

const Metric = ({
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
  <div className="metric-card">
    <div className="flex items-start justify-between">
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg",
          accent ? "bg-gradient-hero text-primary-foreground" : "bg-primary/10 text-primary"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      {accent && <ArrowUpRight className="h-4 w-4 text-accent" />}
    </div>
    <p className="mt-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
      {value}
      {unit && <span className="mr-1 text-sm font-medium text-muted-foreground">{unit}</span>}
    </p>
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
    <td className="py-3 text-sm font-medium text-muted-foreground">{label}</td>
    <td className="py-3 text-sm">
      {existing}
      {unit && <span className="mr-1 text-muted-foreground">{unit}</span>}
    </td>
    <td className="py-3 text-sm font-semibold text-primary">
      {proposed}
      {unit && <span className="mr-1 text-muted-foreground">{unit}</span>}
    </td>
  </tr>
);

export const ReportArtifact = ({ report, plotLabel, gush, helka }: Props) => {
  const status = STATUS_STYLES[report.status];

  return (
    <article className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <Card className="overflow-hidden border-0 shadow-elegant">
        <div className="bg-gradient-hero p-6 text-primary-foreground">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-primary-foreground/70">
                דוח היתכנות • {plotLabel}
              </p>
              <h2 className="text-2xl font-bold leading-tight md:text-3xl">
                {report.headline}
              </h2>
            </div>
            <div
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-2",
                status.bg,
                status.ring
              )}
            >
              <span className={cn("h-2 w-2 animate-pulse rounded-full", status.dot)} />
              {report.statusLabel || status.label}
            </div>
          </div>
        </div>
      </Card>

      {/* Plot location map */}
      <PlotMap gush={gush} helka={helka} />

      {/* Key metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={TrendingUp}
          label="מכפיל יח״ד"
          value={`${fmt(report.metrics.multiplier, 2)}x`}
          accent
        />
        <Metric
          icon={Building2}
          label="יח״ד חדשות (נטו)"
          value={fmt(report.metrics.newUnits)}
        />
        <Metric
          icon={Layers}
          label="שטח מכירה משוער"
          value={fmt(report.metrics.estimatedSellableArea)}
          unit='מ"ר'
        />
        <Metric
          icon={Ruler}
          label="גודל דירה ממוצע"
          value={fmt(report.metrics.avgUnitSize)}
          unit='מ"ר'
        />
      </div>

      {/* Comparison table */}
      <Card className="p-6 shadow-card">
        <div className="mb-4 flex items-center gap-2">
          <Layers className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold">השוואה: קיים מול מוצע</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  פרמטר
                </th>
                <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  מצב קיים
                </th>
                <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-primary">
                  מצב מוצע
                </th>
              </tr>
            </thead>
            <tbody>
              <ComparisonRow
                label="יחידות דיור"
                existing={fmt(report.existing.units)}
                proposed={fmt(report.proposed.units)}
              />
              <ComparisonRow
                label="קומות"
                existing={fmt(report.existing.floors)}
                proposed={fmt(report.proposed.floors)}
              />
              <ComparisonRow
                label="שטח בנוי"
                existing={fmt(report.existing.builtAreaSqm)}
                proposed={fmt(report.proposed.builtAreaSqm)}
                unit='מ"ר'
              />
              <ComparisonRow
                label="אחוזי בנייה (FAR)"
                existing={`${fmt(report.existing.far * 100)}%`}
                proposed={`${fmt(report.proposed.far * 100)}%`}
              />
              <ComparisonRow
                label="גובה מקסימלי"
                existing="—"
                proposed={fmt(report.proposed.heightMeters, 1)}
                unit="מ׳"
              />
            </tbody>
          </table>
        </div>
      </Card>

      {/* Zoning */}
      <Card className="p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold">זכויות בנייה ותקנון</h3>
          </div>
          <span className="text-xs text-muted-foreground">מקור: {report.zoning.source}</span>
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
            <div
              key={it.label}
              className="rounded-lg border bg-muted/30 px-4 py-3"
            >
              <p className="text-xs text-muted-foreground">{it.label}</p>
              <p className="mt-1 text-base font-semibold">{it.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Red flags */}
      {report.redFlags.length > 0 && (
        <Card className="p-6 shadow-card">
          <div className="mb-4 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-danger" />
            <h3 className="text-lg font-bold">דגלים אדומים וסיכונים</h3>
          </div>
          <div className="space-y-3">
            {report.redFlags.map((flag, i) => {
              const s = FLAG_STYLES[flag.level];
              const Icon = s.icon;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex gap-3 rounded-lg border p-4",
                    s.bg,
                    s.border
                  )}
                >
                  <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", s.text)} />
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className={cn("font-semibold", s.text)}>{flag.title}</p>
                      <span className="text-xs text-muted-foreground">{flag.source}</span>
                    </div>
                    <p className="text-sm text-foreground/80">{flag.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Committee summary */}
      <Card className="overflow-hidden border-0 shadow-elegant">
        <div className="bg-gradient-hero p-6 text-primary-foreground">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <h3 className="text-lg font-bold">סיכום לוועדת השקעות</h3>
          </div>
          <p className="text-sm leading-relaxed text-primary-foreground/90 md:text-base">
            {report.committeeSummary}
          </p>
        </div>
      </Card>

      {/* Sources */}
      {report.sources.length > 0 && (
        <Card className="p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              מקורות:
            </span>
            {report.sources.map((s, i) => (
              <span
                key={i}
                className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground"
              >
                {s}
              </span>
            ))}
          </div>
        </Card>
      )}
    </article>
  );
};
