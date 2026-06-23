import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PlotPicker } from "@/components/PlotPicker";
import { DashboardReport } from "@/components/DashboardReport";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import type { AnalysisInput, FeasibilityReport } from "@/types/feasibility";
import { Card } from "@/components/ui/card";
import { FileSearch } from "lucide-react";

const ANALYSIS_STATE_KEY = "telaviv-plot-pathfinder:last-analysis";

type AnalysisJobRow = {
  status: string;
  result: unknown;
  error_message: string | null;
};

type SavedAnalysisState = {
  status: "processing" | "completed";
  jobId?: string;
  input: AnalysisInput;
  report?: FeasibilityReport;
  plotLabel?: string;
  plotIds?: { gush: number; helka: number };
  updatedAt: string;
};

const getReportFromResult = (result: unknown) =>
  (result as { report?: FeasibilityReport } | null)?.report ?? null;

const buildPlotLabel = (input: AnalysisInput) =>
  `רובע ${input.quarter} • גוש ${input.gush} • חלקה ${input.helka}`;

const saveAnalysisState = (state: SavedAnalysisState) => {
  try {
    localStorage.setItem(ANALYSIS_STATE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not persist analysis state", e);
  }
};

const readAnalysisState = (): SavedAnalysisState | null => {
  try {
    const raw = localStorage.getItem(ANALYSIS_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedAnalysisState;
    return parsed?.input ? parsed : null;
  } catch (e) {
    console.warn("Could not restore analysis state", e);
    localStorage.removeItem(ANALYSIS_STATE_KEY);
    return null;
  }
};

const Index = () => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<FeasibilityReport | null>(null);
  const [plotLabel, setPlotLabel] = useState("");
  const [plotIds, setPlotIds] = useState<{ gush: number; helka: number } | null>(null);
  const [lastInput, setLastInput] = useState<AnalysisInput | null>(null);
  const cleanupJobWatchRef = useRef<(() => void) | null>(null);

  const watchAnalysisJob = useCallback((jobId: string, input: AnalysisInput) => {
    cleanupJobWatchRef.current?.();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;
    let cancelled = false;

    const cleanup = () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      if (cleanupJobWatchRef.current === cleanup) cleanupJobWatchRef.current = null;
    };

    cleanupJobWatchRef.current = cleanup;

    const finishWithResult = (row: AnalysisJobRow) => {
      if (settled) return;
      if (row.status === "completed") {
        const report = getReportFromResult(row.result);
        if (!report) {
          settled = true;
          cleanup();
          setLoading(false);
          toast.error("לא התקבל דוח מהמודל");
          return;
        }

        const nextPlotLabel = buildPlotLabel(input);
        const nextPlotIds = { gush: input.gush, helka: input.helka };
        settled = true;
        cleanup();
        setReport(report);
        setPlotLabel(nextPlotLabel);
        setPlotIds(nextPlotIds);
        setLastInput(input);
        setLoading(false);
        saveAnalysisState({
          status: "completed",
          jobId,
          input,
          report,
          plotLabel: nextPlotLabel,
          plotIds: nextPlotIds,
          updatedAt: new Date().toISOString(),
        });
      } else if (row.status === "failed") {
        settled = true;
        cleanup();
        setLoading(false);
        localStorage.removeItem(ANALYSIS_STATE_KEY);
        toast.error(row.error_message || "ניתוח החלקה נכשל");
      }
    };

    const pollJob = async () => {
      if (settled) return;
      const { data: row } = await supabase
        .from("analysis_jobs")
        .select("status, result, error_message")
        .eq("id", jobId)
        .maybeSingle();
      if (row) finishWithResult(row as AnalysisJobRow);
    };

    // Scope the Realtime channel to the authenticated user's id and filter
    // postgres_changes by user_id so subscriptions are user-bound (defense in
    // depth on top of the SELECT RLS policy on analysis_jobs).
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (cancelled) return;
      if (!userId) {
        // No session — rely on polling only (RLS will block reads anyway).
        void pollJob();
        pollTimer = setInterval(pollJob, 3000);
        return;
      }

      channel = supabase
        .channel(`analysis_job_${userId}_${jobId}`, {
          config: { private: true },
        })
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "analysis_jobs",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as AnalysisJobRow & { id?: string };
            if (row?.id && row.id !== jobId) return;
            finishWithResult(row);
          },
        )
        .subscribe();

      void pollJob();
      pollTimer = setInterval(pollJob, 3000);
    })();

    safetyTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      setLoading(false);
      toast.error("הניתוח נמשך זמן רב מהצפוי — נסה שוב");
    }, 5 * 60 * 1000);
  }, []);

  useEffect(() => {
    const saved = readAnalysisState();
    if (!saved) return;

    setLastInput(saved.input);
    if (saved.status === "completed" && saved.report) {
      setReport(saved.report);
      setPlotLabel(saved.plotLabel ?? buildPlotLabel(saved.input));
      setPlotIds(saved.plotIds ?? { gush: saved.input.gush, helka: saved.input.helka });
      return;
    }

    if (saved.status === "processing" && saved.jobId) {
      setLoading(true);
      watchAnalysisJob(saved.jobId, saved.input);
    }

    return () => cleanupJobWatchRef.current?.();
  }, [watchAnalysisJob]);

  const handleAnalyze = async (input: AnalysisInput) => {
    setLoading(true);
    setReport(null);
    setLastInput(input);
    setPlotIds(null);
    cleanupJobWatchRef.current?.();
    localStorage.removeItem(ANALYSIS_STATE_KEY);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-plot", {
        body: input,
      });
      if (error) {
        const msg = (error as { message?: string }).message || "שגיאה בעת שליחת הבקשה. נסה שוב.";
        toast.error(msg);
        setLoading(false);
        return;
      }
      const jobId = (data as { jobId?: string } | null)?.jobId;
      if (!jobId) {
        toast.error("לא התקבל מזהה עבודה מהשרת");
        setLoading(false);
        return;
      }
      saveAnalysisState({ status: "processing", jobId, input, updatedAt: new Date().toISOString() });
      watchAnalysisJob(jobId, input);
    } catch (e) {
      console.error(e);
      cleanupJobWatchRef.current?.();
      setLoading(false);
      toast.error("שגיאה לא צפויה");
    }
  };


  const handleRefresh = () => {
    if (lastInput) {
      toast.info("מרענן את הדוח...");
      handleAnalyze(lastInput);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <AppHeader />

      <div className="container space-y-8 py-8 md:py-12">
        <PlotPicker onAnalyze={handleAnalyze} loading={loading} />

        {!report && !loading && (
          <Card className="flex flex-col items-center justify-center gap-3 border-dashed bg-muted/30 p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileSearch className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold">בחר חלקה כדי להתחיל</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              הניתוח מבוסס על תקנוני רובעים 3 ו-4, תכנית מתאר תא/5000, ומדיניות החניה
              של עיריית תל אביב-יפו.
            </p>
          </Card>
        )}

        {loading && (
          <Card className="space-y-4 p-6">
            <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
            <div className="h-48 animate-pulse rounded-xl bg-muted" />
          </Card>
        )}

        {report && plotIds && lastInput && (
          <DashboardReport
            report={report}
            plotLabel={plotLabel}
            gush={plotIds.gush}
            helka={plotIds.helka}
            input={lastInput}
            onRefresh={handleRefresh}
            refreshing={loading}
          />
        )}

        <footer className="pt-8 text-center text-xs text-muted-foreground">
          הדוח מסתמך על המסמכים המצורפים ועל היוריסטיקה תכנונית. כל החלטת השקעה
          מחייבת בדיקה ידנית בתיק מהנדס העיר.
        </footer>
      </div>
    </main>
  );
};

export default Index;
