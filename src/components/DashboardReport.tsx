
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
import ZoningRightsExtractor from "@/components/ZoningRightsExtractor";
import { Settings } from "lucide-react";
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

type InsightTone = "success" | "warning" | "danger" | "neutral";

const INSIGHT_TONE_CLASS: Record<InsightTone, string> = {
  success: "text-emerald-600 dark:text-emerald-500",
  warning: "text-amber-600 dark:text-amber-500",
  danger: "text-rose-600 dark:text-rose-500",
  neutral: "text-primary",
};

const ComparisonRow = ({
  label,
  sublabel,
  existing,
  proposed,
  unit,
  badge,
  insight,
  insightTone = "neutral",
  explanation,
}: {
  label: string;
  sublabel?: string;
  existing: string | number;
  proposed: string | number;
  unit?: string;
  badge?: React.ReactNode;
  insight?: React.ReactNode;
  insightTone?: InsightTone;
  explanation?: React.ReactNode;
}) => (
  <tr>
    <td className="border-b border-border/60 py-3 text-right text-sm font-medium text-muted-foreground">
      <div className="flex items-center justify-start gap-2">
        {badge}
        <div>
          <span>{label}</span>
          {sublabel && <span className="block text-[10px] text-muted-foreground/70">{sublabel}</span>}
        </div>
      </div>
    </td>
    <td className="w-24 border-b border-border/60 py-3 text-center text-sm tabular-nums">
      {existing}
      {unit && existing !== "—" && <span className="me-1 text-muted-foreground">{unit}</span>}
    </td>
    <td className="w-28 border-b border-border/60 py-3 text-center text-sm font-semibold tabular-nums text-primary">
      {proposed}
      {unit && proposed !== "—" && <span className="me-1 text-muted-foreground">{unit}</span>}
    </td>
    <td className={cn("w-28 border-b border-border/60 py-3 text-center text-sm font-bold tabular-nums", INSIGHT_TONE_CLASS[insightTone])}>
      {insight ?? "—"}
    </td>
    <td className="border-b border-border/60 py-3 text-right text-[12px] leading-snug text-muted-foreground">
      {explanation ?? "—"}
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
              מכפילי תכנית רובעית / פינוי-בינוי מבוססים על ידע ה-LLM, לא על מסמך מצוטט.
            </li>
            <li className="text-muted-foreground">
              <strong>תמ״א 38 פקעה לקליטת בקשות חדשות ב-31.10.2022</strong> — אזכורים בדוח/בתקנון נשמרים כמידע היסטורי בלבד. מסלולים פעילים: תכנית רובעית (תא/3616/א, תא/3729/א) ופינוי-בינוי.
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
            {src.far_bonus_pct > 0 && (
              <span className="text-success"> · כולל תוספת זכויות +{src.far_bonus_pct}% (משפיעה גם על מס' היח"ד)</span>
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

const HousingRangeRows = ({ report, plotArea: _plotArea }: { report: FeasibilityReport; plotArea: number }) => {
  const [sellableRatio, setSellableRatio] = useState(0.78);
  const proposedBuilt = report.proposed?.builtAreaSqm ?? 0;
  const sellable = Math.round(proposedBuilt * sellableRatio);
  const unitRange = report.proposed?.unitRange;
  const range = unitRange && Number.isFinite(unitRange.min) && Number.isFinite(unitRange.max)
    ? unitRange
    : null;

  const proposedUnits = report.proposed?.units ?? 0;
  const existingUnits = report.existing?.units ?? 0;
  const unitsMult = existingUnits > 0 ? proposedUnits / existingUnits : NaN;
  const unitsTone: InsightTone =
    !Number.isFinite(unitsMult) ? "neutral"
    : unitsMult >= 2.2 ? "success"
    : unitsMult >= 1.8 ? "neutral"
    : unitsMult >= 1.5 ? "warning"
    : "danger";
  const unitsText =
    !Number.isFinite(unitsMult) ? "—"
    : unitsMult >= 2.2 ? 'מכפיל יח"ד בריא להתחדשות — אטרקטיבי גם ליזם וגם לדיירים.'
    : unitsMult >= 1.8 ? 'מכפיל יח"ד גבולי-טוב — לרוב סף הכניסה לתמ"א/פינוי-בינוי.'
    : unitsMult >= 1.5 ? 'מכפיל יח"ד נמוך — לרוב לא יצדיק את עלות ההתחדשות.'
    : 'מכפיל יח"ד לא כלכלי — נדרשת בחינה מחדש של תמהיל/זכויות.';

  const sellPct = proposedBuilt > 0 ? (sellable / proposedBuilt) * 100 : NaN;
  const sellTone: InsightTone =
    !Number.isFinite(sellPct) ? "neutral"
    : sellPct >= 80 ? "success"
    : sellPct >= 70 ? "neutral"
    : "warning";
  const sellText = 'שטח המכירה הוא מקור ההכנסה בפועל. ניתן לכוונן את מקדם המכירה לפי תכנון הפרויקט.';

  return (
    <>
      <tr>
        <td className="border-b border-border/60 py-3 text-right text-sm font-medium text-muted-foreground">
          <div>
            <span>יחידות דיור</span>
            <span className="block text-[10px] text-muted-foreground/70">לפי תמהיל ממוצע</span>
          </div>
        </td>
        <td className="w-24 border-b border-border/60 py-3 text-center text-sm tabular-nums">
          {existingUnits || '—'}
        </td>
        <td className="w-28 border-b border-border/60 py-3 text-center text-sm font-semibold tabular-nums text-primary">
          {range ? (
            <>
              {range.min}–{range.max}
              <span className="ms-1 text-[10px] font-normal text-muted-foreground">(ממוצע: {range.base})</span>
            </>
          ) : (
            proposedUnits || '—'
          )}
        </td>
        <td className={cn("w-28 border-b border-border/60 py-3 text-center text-sm font-bold tabular-nums", INSIGHT_TONE_CLASS[unitsTone])}>
          {Number.isFinite(unitsMult) ? `×${unitsMult.toFixed(2)}` : "—"}
        </td>
        <td className="border-b border-border/60 py-3 text-right text-[12px] leading-snug text-muted-foreground">
          {unitsText}
        </td>
      </tr>

      <tr className="bg-primary/5">
        <td className="border-b border-border/60 py-3 text-right text-sm font-semibold text-primary">
          <div>
            <span>שטח מכיר</span>
            <span className="block text-[10px] font-normal text-muted-foreground">שטח ברוטו × מקדם מכירה</span>
          </div>
        </td>
        <td className="w-24 border-b border-border/60 py-3 text-center text-sm text-muted-foreground">—</td>
        <td className="w-28 border-b border-border/60 py-3 text-center align-middle">
          <div className="flex flex-col items-center">
            <div className="text-sm font-bold tabular-nums text-primary">
              {sellable > 0 ? sellable.toLocaleString('he-IL') : '—'}
              <span className="me-1 text-[10px] font-normal text-muted-foreground">מ"ר</span>
            </div>
            <div className="mt-1 flex items-center justify-center gap-1 text-[10px] font-normal text-muted-foreground">
              <span>מקדם:</span>
              <input
                type="number"
                value={Math.round(sellableRatio * 100)}
                min={60}
                max={90}
                onChange={e => setSellableRatio(Number(e.target.value) / 100)}
                className="w-10 border border-border rounded px-1 py-0.5 text-center text-[10px]"
              />
              <span>%</span>
            </div>
          </div>
        </td>
        <td className={cn("w-28 border-b border-border/60 py-3 text-center text-sm font-bold tabular-nums", INSIGHT_TONE_CLASS[sellTone])}>
          {Number.isFinite(sellPct) ? `${Math.round(sellPct)}%` : "—"}
        </td>
        <td className="border-b border-border/60 py-3 text-right text-[12px] leading-snug text-muted-foreground">
          {sellText}
        </td>
      </tr>
    </>
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

      {/* Dashboard tabs — narrative flow: parcel+zoning → proposed → risks → financial */}
      <Tabs defaultValue="parcel" className="w-full">
        <TabsList dir="rtl" className="grid w-full grid-cols-5">
          <TabsTrigger value="parcel" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">חלקה וזכויות</span>
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
          <TabsTrigger value="admin" className="gap-1.5">
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">ניהול זכויות</span>
          </TabsTrigger>
        </TabsList>
        {/* PARCEL + ZONING — what exists, what's allowed, and the utilization gap */}
        <TabsContent value="parcel" className="mt-4 space-y-4">
          <PlotMap gush={gush} helka={helka} />
          <Card dir="rtl" className="p-5 shadow-card text-right space-y-6">
            {/* Section 1 — מה יש: זיהוי החלקה */}
            <div>
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
                  icon={BookOpen}
                  label="ייעוד קרקע"
                  value={
                    report.calculationSource?.method === "regulation"
                      ? report.calculationSource.zone_label
                      : "—"
                  }
                  source={
                    report.calculationSource?.method === "regulation"
                      ? `${report.calculationSource.plan_code} · תקנון רובע ${input.quarter}`
                      : report.zoning.source
                  }
                />
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
            </div>

            {/* Section 2 — מצב בנוי קיים */}
            <div className="border-t pt-5">
              <div className="mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-bold">מצב בנוי קיים</h4>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
                {(() => {
                  const existingCoveragePct =
                    typeof report.zoning.coverageExistingPct === "number"
                      ? report.zoning.coverageExistingPct
                      : report.existing.floors > 0 && plotArea > 0
                        ? (report.existing.builtAreaSqm / report.existing.floors / plotArea) * 100
                        : NaN;
                  const coverageSource =
                    typeof report.zoning.coverageExistingPct === "number"
                      ? report.zoning.coverageSource ?? "GIS עיריית ת״א"
                      : "חישוב: שטח בנוי ÷ קומות ÷ שטח מגרש";
                  return (
                    <StatTile
                      icon={Ruler}
                      label="תכסית קיימת"
                      value={Number.isFinite(existingCoveragePct) ? `${fmt(existingCoveragePct)}%` : "—"}
                      source={coverageSource}
                    />
                  );
                })()}
                <div className="col-span-full">
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-semibold text-primary">ציטוט מקור תכסית קיימת:</span>{" "}
                    {typeof report.zoning.coverageExistingPct === "number"
                      ? `נתון GIS — ${report.zoning.coverageSource ?? "GIS עיריית ת״א"}`
                      : "חישוב פנימי — שטח בנוי קיים ÷ קומות ÷ שטח מגרש"}
                  </p>
                </div>
                <StatTile
                  icon={TrendingUp}
                  label="FAR קיים"
                  value={`${fmt(report.existing.far * 100)}%`}
                  source="חישוב: שטח בנוי ÷ שטח מגרש"
                />
              </div>

            </div>

            {/* Section 3 — מעטפת זכויות ע״פ תקנון */}
            <div className="border-t pt-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-bold">מעטפת זכויות ע״פ תקנון</h4>
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
            </div>

            {/* טבלת השוואת ניצול הועברה לטאב "תכנון מוצע" */}
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
                <table dir="rtl" className="w-full border-separate border-spacing-x-4 border-spacing-y-0">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="border-b-2 border-border pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        פרמטר
                      </th>
                      <th className="w-24 border-b-2 border-border pb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        קיים
                      </th>
                      <th className="w-28 border-b-2 border-border pb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-primary">
                        מוצע
                      </th>
                      <th className="w-28 border-b-2 border-border pb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        תובנה
                      </th>
                      <th className="border-b-2 border-border pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        הסבר
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const propFloors = report.proposed.floors || 1;
                      const propFloorArea = report.proposed.builtAreaSqm / propFloors;
                      const propCoverage = plotArea > 0 ? (propFloorArea / plotArea) * 100 : 0;
                      const existCov = report.zoning.coverageExistingPct;
                      const existFootprint = report.zoning.buildingFootprintSqm;

                      // Insights
                      const gfaMult = report.existing.builtAreaSqm > 0
                        ? report.proposed.builtAreaSqm / report.existing.builtAreaSqm
                        : NaN;
                      const gfaTone: InsightTone =
                        !Number.isFinite(gfaMult) ? "neutral"
                        : gfaMult >= 2.5 ? "success"
                        : gfaMult >= 2.0 ? "neutral"
                        : gfaMult >= 1.5 ? "warning"
                        : "danger";
                      const gfaText =
                        !Number.isFinite(gfaMult) ? "—"
                        : gfaMult >= 2.5 ? "מכפיל GFA מצוין — מרווח רווחיות גבוה ליזם."
                        : gfaMult >= 2.0 ? "מכפיל GFA בטווח הכלכלי המקובל להתחדשות (~2.0×)."
                        : gfaMult >= 1.5 ? "מכפיל GFA גבולי — תלוי בעלויות בנייה ובהיתרים."
                        : "מכפיל GFA נמוך — סביר שלא יצדיק הריסה ובנייה.";

                      const covDelta = existCov != null ? propCoverage - existCov : NaN;
                      const covTone: InsightTone =
                        !Number.isFinite(covDelta) ? "neutral"
                        : covDelta > 15 ? "warning"
                        : covDelta > 5 ? "neutral"
                        : "success";
                      const covText =
                        !Number.isFinite(covDelta) ? "—"
                        : covDelta > 15 ? "קפיצת תכסית משמעותית — צפוי להידרש אישור ועדה והקלות."
                        : covDelta > 5 ? "הגדלת תכסית מתונה — מקור עיקרי לתוספת ערך מוסף."
                        : "שינוי תכסית מינורי — לרוב בתחום הזכויות הקיימות.";

                      const floorAreaDelta = existFootprint != null ? propFloorArea - existFootprint : NaN;
                      const floorAreaPct = existFootprint && existFootprint > 0
                        ? (propFloorArea / existFootprint - 1) * 100
                        : NaN;
                      const faTone: InsightTone =
                        !Number.isFinite(floorAreaPct) ? "neutral"
                        : floorAreaPct >= 20 ? "success"
                        : floorAreaPct >= 0 ? "neutral"
                        : "warning";
                      const faText =
                        !Number.isFinite(floorAreaPct) ? "—"
                        : floorAreaPct >= 20 ? "פוטפרינט גדל משמעותית — מאפשר תכנון קומה יעיל יותר."
                        : floorAreaPct >= 0 ? "תוספת מתונה לשטח הקומה — תכנון דומה למצב הקיים."
                        : "צמצום פוטפרינט — מצריך תוספת קומות לפיצוי.";

                      const floorsDelta = report.proposed.floors - report.existing.floors;
                      const flTone: InsightTone =
                        floorsDelta >= 4 ? "success"
                        : floorsDelta >= 2 ? "neutral"
                        : floorsDelta >= 0 ? "warning"
                        : "danger";
                      const flText =
                        floorsDelta >= 4 ? `תוספת ${floorsDelta} קומות — מקור עיקרי ליחידות החדשות.`
                        : floorsDelta >= 2 ? `תוספת ${floorsDelta} קומות — תורמת לכדאיות אך לא דרמטית.`
                        : floorsDelta >= 0 ? "תוספת קומות מצומצמת — מגבילה את מכפיל היחידות."
                        : "ירידה במספר הקומות — חריג, יש לוודא נכונות הנתון.";

                      return (
                        <>
                          <ComparisonRow
                            label="שטח בנוי"
                            existing={fmt(report.existing.builtAreaSqm)}
                            proposed={fmt(report.proposed.builtAreaSqm)}
                            unit='מ"ר'
                            insight={Number.isFinite(gfaMult) ? `×${gfaMult.toFixed(2)}` : "—"}
                            insightTone={gfaTone}
                            explanation={gfaText}
                            badge={input.existingBuiltAreaSource ? (
                              <Badge variant="outline" className="text-[10px]">
                                {BUILT_AREA_SOURCE_LABEL[input.existingBuiltAreaSource] ?? input.existingBuiltAreaSource}
                              </Badge>
                            ) : undefined}
                          />
                          <ComparisonRow
                            label="תכסית"
                            sublabel="% משטח המגרש"
                            existing={existCov != null ? `${fmt(existCov)}%` : "—"}
                            proposed={propCoverage > 0 ? `${fmt(propCoverage)}%` : "—"}
                            insight={Number.isFinite(covDelta) ? `${covDelta >= 0 ? "+" : ""}${fmt(covDelta)} נק׳` : "—"}
                            insightTone={covTone}
                            explanation={covText}
                          />
                          <ComparisonRow
                            label="שטח עיקרי לקומה"
                            existing={existFootprint != null ? fmt(existFootprint) : "—"}
                            proposed={propFloorArea > 0 ? fmt(propFloorArea) : "—"}
                            unit='מ"ר'
                            insight={Number.isFinite(floorAreaDelta) ? `${floorAreaDelta >= 0 ? "+" : ""}${fmt(floorAreaDelta)}` : "—"}
                            insightTone={faTone}
                            explanation={faText}
                          />
                          <ComparisonRow
                            label="קומות"
                            existing={fmt(report.existing.floors)}
                            proposed={fmt(report.proposed.floors)}
                            insight={`${floorsDelta >= 0 ? "+" : ""}${floorsDelta}`}
                            insightTone={flTone}
                            explanation={flText}
                          />
                          <HousingRangeRows report={report} plotArea={plotArea} />
                        </>
                      );
                    })()}
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

          {/* היתכנות תכנונית — קומות נדרשות ותוספת התחדשות (הועבר מטאב הזכויות) */}
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
            const rp = report.zoning.renewalPotential;

            return (
              <Card dir="rtl" className="p-5 shadow-card text-right">
                <div className="mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h3 className="text-base font-bold">היתכנות תכנונית</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
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
                    <SourceBadge source="חישוב: שטח מגרש × FAR ÷ שטח קומה תכנוני" />
                  </div>
                  {rp ? (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                      <p className="text-xs text-muted-foreground">תוספת אפקטיבית סה״כ (התחדשות)</p>
                      <p className="mt-1 text-base font-semibold text-primary">
                        +{fmt(rp.effectiveUpliftSqmTotal)} מ״ר
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        תוספת לקומה × מס׳ קומות × מקדם מימוש {fmt(rp.realizationFactor * 100)}% · חלק דיירים {rp.tenantShareOfUpliftPct}%
                      </p>
                      <SourceBadge source={`${rp.source} · קווי בניין מוקלים ${rp.frontSetbackM}/${rp.sideSetbackM}/${rp.rearSetbackM} מ׳`} />
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 px-4 py-3">
                      <p className="text-xs text-muted-foreground">פוטנציאל התחדשות</p>
                      <p className="mt-1 text-sm text-muted-foreground">לא זוהה מסלול התחדשות רלוונטי למגרש זה.</p>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-foreground">חישוב מספר הקומות מתבסס תמיד על המעטפת התכנונית.</span>{" "}
                    תכסית קיימת משמשת לזיהוי חריגות היסטוריות; פוטנציאל ההתחדשות מציג את ההגדלה הריאלית של שטח הקומה והניצול במסלול הרלוונטי.
                  </p>
                </div>
              </Card>
            );
          })()}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={TrendingUp} label="מכפיל יח״ד" value={`${fmt(report.metrics.multiplier, 2)}x`} accent source="יח״ד מוצעות ÷ יח״ד קיימות" />
            <StatTile icon={Building2} label="יח״ד נטו" value={fmt(report.metrics.newUnits)} source="יח״ד מוצעות − יח״ד קיימות" />
            <StatTile icon={Layers} label="שטח מכירה" value={fmt(report.metrics.estimatedSellableArea)} unit='מ"ר' source="שטח עיקרי מוצע × מקדם מכירה (~0.85)" />
            <StatTile icon={Ruler} label="דירה ממוצעת" value={fmt(report.metrics.avgUnitSize)} unit='מ"ר' source="מקדם צפיפות לפי תקנון הרובע" />
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

        <TabsContent value="admin" className="mt-4">
          <Card className="p-2 shadow-card">
            <ZoningRightsExtractor />
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
};
