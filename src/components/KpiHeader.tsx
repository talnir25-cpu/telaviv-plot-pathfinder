import type { FeasibilityReport } from "@/types/feasibility";
import { buildHeaderKpis, type KpiTone } from "@/lib/kpi-calculations";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

const TONE_STYLES: Record<KpiTone, { ring: string; value: string; dot: string }> = {
  success: { ring: "ring-success/30", value: "text-success", dot: "bg-success" },
  warning: { ring: "ring-warning/40", value: "text-warning", dot: "bg-warning" },
  danger: { ring: "ring-danger/40", value: "text-danger", dot: "bg-danger" },
  neutral: { ring: "ring-border", value: "text-foreground", dot: "bg-muted-foreground" },
};

interface Props {
  report: FeasibilityReport;
}

export const KpiHeader = ({ report }: Props) => {
  const kpis = buildHeaderKpis(report);

  return (
    <TooltipProvider delayDuration={150}>
      <div dir="rtl" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi) => {
          const tone = TONE_STYLES[kpi.tone];
          return (
            <Tooltip key={kpi.key}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "group relative cursor-help rounded-xl border bg-card p-3 ring-1 transition-shadow hover:shadow-md",
                    tone.ring
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {kpi.label}
                      </span>
                    </div>
                    <Info className="h-3 w-3 text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                  <div className={cn("mt-1 text-xl font-bold tabular-nums", tone.value)}>
                    {kpi.value}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-end" dir="rtl">
                <p className="text-xs leading-relaxed">{kpi.insight}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};
