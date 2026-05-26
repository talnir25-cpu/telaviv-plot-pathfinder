import { useEffect, useMemo, useRef, useState } from "react";
import plotsData from "@/data/plots.json";
import type { Plot, AnalysisInput } from "@/types/feasibility";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Search, Sparkles, MapPin, CheckCircle2, Database, Building2,
  Calculator, Activity, RefreshCw, ChevronDown, XCircle, AlertCircle, MinusCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type UnitsSource = "manual" | "govmap_bldg" | "nadlan" | "heuristic" | "estimate" | null;

interface SourceResult {
  source: string;
  units: number | null;
  floors: number | null;
  totalFloorArea: number | null;
  confidence: "high" | "medium" | "low" | "very_low" | null;
  status: "ok" | "empty" | "error" | "skipped";
  label: string;
  detail: string;
  errorMsg?: string;
  durationMs: number;
  raw?: unknown;
}

const SOURCE_META: Record<string, { label: string; icon: typeof Database; tone: string }> = {
  manual: { label: "מאומת ידנית", icon: CheckCircle2, tone: "text-primary" },
  govmap_bldg: { label: "GovMap מבנים", icon: Building2, tone: "text-primary" },
  nadlan: { label: 'נדל"ן הממשלתי', icon: Database, tone: "text-primary" },
  heuristic: { label: "הערכה אוטומטית", icon: Calculator, tone: "text-muted-foreground" },
  estimate: { label: "הערכה אוטומטית", icon: Calculator, tone: "text-muted-foreground" },
};

const CONFIDENCE_META: Record<string, { label: string; tone: string }> = {
  high: { label: "אמינות גבוהה", tone: "text-emerald-600 dark:text-emerald-400" },
  medium: { label: "אמינות בינונית", tone: "text-amber-600 dark:text-amber-400" },
  low: { label: "אמינות נמוכה", tone: "text-orange-600 dark:text-orange-400" },
  very_low: { label: "הערכה גסה", tone: "text-muted-foreground" },
};

const STATUS_ICON = {
  ok: { Icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400" },
  empty: { Icon: MinusCircle, tone: "text-muted-foreground" },
  error: { Icon: XCircle, tone: "text-destructive" },
  skipped: { Icon: AlertCircle, tone: "text-muted-foreground" },
} as const;

const PLOTS = plotsData as Plot[];

interface Props {
  onAnalyze: (input: AnalysisInput) => Promise<void> | void;
  loading: boolean;
}

export const PlotPicker = ({ onAnalyze, loading }: Props) => {
  const [quarter, setQuarter] = useState<3 | 4>(3);
  const [gushQuery, setGushQuery] = useState("");
  const [helka, setHelka] = useState("");
  const [existingUnits, setExistingUnits] = useState("8");
  const [existingFloors, setExistingFloors] = useState("3");
  const [unitsSource, setUnitsSource] = useState<UnitsSource>(null);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [conservation, setConservation] = useState(false);
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"address" | "manual">("address");
  const [address, setAddress] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const lookupReqRef = useRef(0);

  const lookupAddress = async () => {
    const q = address.trim();
    if (q.length < 3) {
      toast.error("הזן/י כתובת מלאה (רחוב + מספר + עיר)");
      return;
    }
    setGeocoding(true);
    setResolvedAddress(null);
    try {
      const { data, error } = await supabase.functions.invoke("geocode-address", {
        body: { address: q },
      });
      if (error) throw error;
      if (!data?.gush || !data?.helka) {
        toast.error(data?.error || "לא נמצא גוש/חלקה");
        return;
      }
      const found = PLOTS.find(
        (p) => p.gush === data.gush && p.helka === data.helka,
      );
      if (!found) {
        toast.error(
          `הכתובת מופתה לגוש ${data.gush} חלקה ${data.helka}, אך אינה ברובע 3 או 4.`,
        );
        return;
      }
      setQuarter(found.q);
      setGushQuery(String(found.gush));
      setHelka(String(found.helka));
      setResolvedAddress(data.address);
      toast.success(`נמצא: גוש ${found.gush} חלקה ${found.helka} (רובע ${found.q})`);
    } catch (e) {
      console.error(e);
      const msg = (e as { message?: string })?.message || "שגיאה בחיפוש כתובת";
      toast.error(msg);
    } finally {
      setGeocoding(false);
    }
  };

  const gushOptions = useMemo(() => {
    const set = new Set<number>();
    for (const p of PLOTS) if (p.q === quarter) set.add(p.gush);
    return Array.from(set).sort((a, b) => a - b);
  }, [quarter]);

  const filteredGush = useMemo(() => {
    const q = gushQuery.trim();
    if (!q) return gushOptions.slice(0, 30);
    return gushOptions.filter((g) => String(g).startsWith(q)).slice(0, 30);
  }, [gushOptions, gushQuery]);

  const helkaOptions = useMemo(() => {
    const g = Number(gushQuery);
    if (!g) return [];
    return PLOTS.filter((p) => p.q === quarter && p.gush === g)
      .map((p) => p.helka)
      .sort((a, b) => a - b);
  }, [quarter, gushQuery]);

  const selectedPlot = useMemo(() => {
    const g = Number(gushQuery);
    const h = Number(helka);
    if (!g || !h) return null;
    return PLOTS.find((p) => p.q === quarter && p.gush === g && p.helka === h) ?? null;
  }, [quarter, gushQuery, helka]);

  // Auto-fetch existing units when a plot is selected (cache → GovMap → estimate)
  useEffect(() => {
    if (!selectedPlot) {
      setUnitsSource(null);
      return;
    }
    const reqId = ++lookupReqRef.current;
    setUnitsLoading(true);
    setUnitsSource(null);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("lookup-plot-units", {
          body: {
            gush: selectedPlot.gush,
            helka: selectedPlot.helka,
            plotArea: selectedPlot.area ?? selectedPlot.shapeArea,
          },
        });
        if (reqId !== lookupReqRef.current) return; // stale
        if (error || !data || data.error) {
          console.warn("units lookup failed", error || data?.error);
          return;
        }
        if (typeof data.units === "number") setExistingUnits(String(data.units));
        if (typeof data.floors === "number") setExistingFloors(String(data.floors));
        setUnitsSource((data.source as UnitsSource) ?? "estimate");
      } catch (e) {
        console.warn("units lookup error", e);
      } finally {
        if (reqId === lookupReqRef.current) setUnitsLoading(false);
      }
    })();
  }, [selectedPlot]);

  const saveManualUnits = async () => {
    if (!selectedPlot) return;
    const u = Number(existingUnits);
    const f = Number(existingFloors);
    if (!u || u < 1) {
      toast.error("הזן/י מספר יח״ד תקין");
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke("lookup-plot-units", {
        body: {
          gush: selectedPlot.gush,
          helka: selectedPlot.helka,
          manualUnits: u,
          manualFloors: f || undefined,
        },
      });
      if (error || data?.error) {
        toast.error(error?.message || data?.error || "שגיאה בשמירה");
        return;
      }
      setUnitsSource("manual");
      toast.success("הנתון נשמר ויהיה זמין לכל המשתמשים");
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בשמירה");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlot) return;
    onAnalyze({
      quarter,
      gush: selectedPlot.gush,
      helka: selectedPlot.helka,
      area: selectedPlot.area,
      shapeArea: selectedPlot.shapeArea,
      existingUnits: Number(existingUnits) || 0,
      existingFloors: Number(existingFloors) || 0,
      conservation,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Card className="p-6 shadow-card">
      <Tabs value={mode} onValueChange={(v) => setMode(v as "address" | "manual")} className="mb-5">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="address">
            <MapPin className="ml-2 h-4 w-4" />
            חיפוש לפי כתובת
          </TabsTrigger>
          <TabsTrigger value="manual">
            <Search className="ml-2 h-4 w-4" />
            בחירה ידנית (גוש/חלקה)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="address" className="mt-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="address">כתובת מלאה בתל אביב-יפו</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="address"
                  placeholder="לדוגמה: דיזנגוף 50, תל אביב"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      lookupAddress();
                    }
                  }}
                  className="pr-10"
                />
              </div>
              <Button
                type="button"
                onClick={lookupAddress}
                disabled={geocoding || address.trim().length < 3}
                variant="secondary"
              >
                {geocoding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Search className="ml-2 h-4 w-4" />
                    אתר חלקה
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              החיפוש משתמש ב-GovMap הממשלתי. נתמך רק עבור חלקות ברובע 3 ורובע 4.
            </p>
          </div>

          {resolvedAddress && gushQuery && helka && (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <div className="font-medium">{resolvedAddress}</div>
                <div className="text-xs text-muted-foreground">
                  רובע {quarter} • גוש {gushQuery} • חלקה {helka}
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="manual" className="mt-2 text-xs text-muted-foreground">
          בחר/י את הרובע, הגוש והחלקה ידנית בטופס מטה.
        </TabsContent>
      </Tabs>

      <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label>רובע</Label>
          <Select
            value={String(quarter)}
            onValueChange={(v) => {
              setQuarter(Number(v) as 3 | 4);
              setGushQuery("");
              setHelka("");
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">רובע 3 (תא/3616א)</SelectItem>
              <SelectItem value="4">רובע 4 (תא/3729א)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gush">מספר גוש</Label>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="gush"
              list="gush-list"
              inputMode="numeric"
              placeholder="לדוגמה 6953"
              value={gushQuery}
              onChange={(e) => {
                setGushQuery(e.target.value.replace(/\D/g, ""));
                setHelka("");
              }}
              className="pr-10"
            />
            <datalist id="gush-list">
              {filteredGush.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <p className="text-xs text-muted-foreground">
            {gushOptions.length.toLocaleString("he-IL")} גושים זמינים ברובע {quarter}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="helka">חלקה</Label>
          <Select
            value={helka}
            onValueChange={setHelka}
            disabled={helkaOptions.length === 0}
          >
            <SelectTrigger id="helka">
              <SelectValue
                placeholder={
                  helkaOptions.length === 0
                    ? "בחר/י גוש קודם"
                    : `${helkaOptions.length} חלקות`
                }
              />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {helkaOptions.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  חלקה {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>שטח החלקה</Label>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            {selectedPlot
              ? `${(selectedPlot.area ?? selectedPlot.shapeArea ?? 0).toLocaleString("he-IL")} מ"ר`
              : "—"}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="units">יח"ד קיימות</Label>
            {unitsLoading ? (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Loader2 className="h-3 w-3 animate-spin" />
                מאתר...
              </Badge>
            ) : unitsSource ? (
              (() => {
                const meta = SOURCE_META[unitsSource];
                const Icon = meta.icon;
                return (
                  <Badge variant="outline" className={`gap-1 text-[10px] ${meta.tone}`}>
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </Badge>
                );
              })()
            ) : null}
          </div>
          <Input
            id="units"
            inputMode="numeric"
            value={existingUnits}
            onChange={(e) => {
              setExistingUnits(e.target.value.replace(/\D/g, ""));
              if (unitsSource && unitsSource !== "manual") setUnitsSource(null);
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="floors">קומות קיימות</Label>
          <Input
            id="floors"
            inputMode="numeric"
            value={existingFloors}
            onChange={(e) => setExistingFloors(e.target.value.replace(/\D/g, ""))}
          />
        </div>

        {selectedPlot && unitsSource && unitsSource !== "manual" && (
          <div className="md:col-span-2 flex items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/20 px-4 py-2.5 text-xs">
            <span className="text-muted-foreground">
              {unitsSource === "govmap_bldg"
                ? "הערכה לפי שכבת מבנים של GovMap. אם הנתון שגוי — תקן/י וסמן/י כמאומת."
                : 'הערכה היוריסטית (שטח × קומות ÷ 80 מ"ר). אם ידוע לך הנתון — תקן/י ושמור.'}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={saveManualUnits}
              className="shrink-0"
            >
              <Database className="ml-1.5 h-3.5 w-3.5" />
              שמור כמאומת
            </Button>
          </div>
        )}

        <div className="md:col-span-2 flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
          <div>
            <Label htmlFor="cons" className="cursor-pointer">
              מבנה לשימור / איזור הכרזת UNESCO
            </Label>
            <p className="text-xs text-muted-foreground">סמן/י אם החלקה בתוך מתחם השימור</p>
          </div>
          <Switch id="cons" checked={conservation} onCheckedChange={setConservation} />
        </div>

        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="notes">הערות נוספות (אופציונלי)</Label>
          <Textarea
            id="notes"
            rows={2}
            placeholder="לדוגמה: מגרש פינתי, חזית מסחרית, תב״ע נקודתית..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="md:col-span-2">
          <Button
            type="submit"
            size="lg"
            disabled={!selectedPlot || loading}
            className="w-full bg-gradient-hero text-primary-foreground hover:opacity-95"
          >
            {loading ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                מנתח את החלקה...
              </>
            ) : (
              <>
                <Sparkles className="ml-2 h-4 w-4" />
                הפק דוח היתכנות
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
};
