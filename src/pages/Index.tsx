import { useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { PlotPicker } from "@/components/PlotPicker";
import { ReportArtifact } from "@/components/ReportArtifact";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import type { AnalysisInput, FeasibilityReport } from "@/types/feasibility";
import { Card } from "@/components/ui/card";
import { FileSearch } from "lucide-react";

const Index = () => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<FeasibilityReport | null>(null);
  const [plotLabel, setPlotLabel] = useState("");
  const [plotIds, setPlotIds] = useState<{ gush: number; helka: number } | null>(null);
  const [lastInput, setLastInput] = useState<AnalysisInput | null>(null);

  const handleAnalyze = async (input: AnalysisInput) => {
    setLoading(true);
    setReport(null);
    setLastInput(input);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-plot", {
        body: input,
      });
      if (error) {
        const msg =
          (error as { message?: string }).message ||
          "שגיאה בעת ניתוח החלקה. נסה שוב.";
        toast.error(msg);
        return;
      }
      if (!data?.report) {
        toast.error("לא התקבל דוח מהמודל");
        return;
      }
      setReport(data.report as FeasibilityReport);
      setPlotLabel(`רובע ${input.quarter} • גוש ${input.gush} • חלקה ${input.helka}`);
      setPlotIds({ gush: input.gush, helka: input.helka });
    } catch (e) {
      console.error(e);
      toast.error("שגיאה לא צפויה");
    } finally {
      setLoading(false);
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

        {report && plotIds && (
          <ReportArtifact
            report={report}
            plotLabel={plotLabel}
            gush={plotIds.gush}
            helka={plotIds.helka}
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
