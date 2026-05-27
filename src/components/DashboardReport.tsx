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
    <td className="py-2.5 text-right text-sm font-medium text-muted-foreground">{label}</td>
    <td className="w-28 py-2.5 text-center text-sm tabular-nums">
      {existing}
      {unit && existing !== "—" && <span className="mr-1 text-muted-foreground">{unit}</span>}
    </td>
    <td className="w-28 py-2.5 text-center text-sm font-semibold tabular-nums text-primary">
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
        <TabsList className="grid w-full grid-cols-6">
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
          <TabsTrigger value="sources" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">מקורות</span>
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
                <table className="w-full border-separate border-spacing-x-6 border-spacing-y-0">
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

            {/* אילוצים פיזיים-רגולטוריים */}
            <div className="mt-5 border-t pt-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                אילוצים פיזיים-רגולטוריים
              </p>
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

        {/* SOURCES */}
        <TabsContent value="sources" className="mt-4 space-y-4">
          <Card className="p-5 shadow-card">
            <div className="mb-2 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h3 className="text-base font-bold">על מה מבוססות התובנות</h3>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              שקיפות מלאה על מקורות הנתונים, ההיוריסטיקה וההנחות. כל החלטת השקעה
              מחייבת אימות בתיק מהנדס העיר.
            </p>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Official planning docs */}
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

              {/* Live plot data */}
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

              {/* AI knowledge */}
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

              {/* What's not there */}
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
              <div className="mt-4 rounded-lg border bg-muted/30 p-3">
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
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
};
