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
import {
  DEFAULT_SETBACKS,
  estimateTypicalFloorArea,
  coveragePct,
} from "@/lib/setback-standards";
import { BookOpen, RotateCcw } from "lucide-react";

type UnitsSource = "manual" | "tlv_permits" | "govmap_bldg" | "nadlan" | "heuristic" | "estimate" | null;

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
  tlv_permits: { label: 'עיריית ת"א - היתרים', icon: Building2, tone: "text-primary" },
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
  const [existingBuiltArea, setExistingBuiltArea] = useState("");
  const [unitsSource, setUnitsSource] = useState<UnitsSource>(null);
  const [unitsConfidence, setUnitsConfidence] = useState<SourceResult["confidence"]>(null);
  const [floorsSource, setFloorsSource] = useState<UnitsSource>(null);
  const [floorsConfidence, setFloorsConfidence] = useState<SourceResult["confidence"]>(null);
  const [builtAreaSource, setBuiltAreaSource] = useState<UnitsSource>(null);
  const [builtAreaConfidence, setBuiltAreaConfidence] = useState<SourceResult["confidence"]>(null);
  const [sources, setSources] = useState<SourceResult[]>([]);
  const [diagOpen, setDiagOpen] = useState(false);
  const [rawDialog, setRawDialog] = useState<SourceResult | null>(null);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [conservation, setConservation] = useState(false);
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<"address" | "manual">("address");
  const [address, setAddress] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  // קווי בניין — ברירת מחדל מהתקנון, ניתן לדריסה ידנית
  const [frontSetback, setFrontSetback] = useState<string>(String(DEFAULT_SETBACKS[3].front));
  const [sideSetback, setSideSetback] = useState<string>(String(DEFAULT_SETBACKS[3].side));
  const [rearSetback, setRearSetback] = useState<string>(String(DEFAULT_SETBACKS[3].rear));
  const [setbackTouched, setSetbackTouched] = useState(false);
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

  const runLookup = async (refresh = false) => {
    if (!selectedPlot) return;
    const reqId = ++lookupReqRef.current;
    setUnitsLoading(true);
    if (!refresh) {
      setUnitsSource(null);
      setUnitsConfidence(null);
      setSources([]);
    }
    try {
      const { data, error } = await supabase.functions.invoke("lookup-plot-units", {
        body: {
          gush: selectedPlot.gush,
          helka: selectedPlot.helka,
          plotArea: selectedPlot.area ?? selectedPlot.shapeArea,
          refresh,
        },
      });
      if (reqId !== lookupReqRef.current) return;
      if (error || !data || data.error) {
        console.warn("units lookup failed", error || data?.error);
        return;
      }
      if (typeof data.units === "number") setExistingUnits(String(data.units));
      if (typeof data.floors === "number") setExistingFloors(String(data.floors));
      if (typeof data.builtArea === "number" && data.builtArea > 0) {
        setExistingBuiltArea(String(Math.round(data.builtArea)));
      } else if (!refresh) {
        setExistingBuiltArea("");
      }
      setUnitsSource((data.source as UnitsSource) ?? "estimate");
      setUnitsConfidence((data.confidence as SourceResult["confidence"]) ?? null);
      setFloorsSource((data.floorsSource as UnitsSource) ?? null);
      setFloorsConfidence((data.floorsConfidence as SourceResult["confidence"]) ?? null);
      setBuiltAreaSource((data.builtAreaSource as UnitsSource) ?? null);
      setBuiltAreaConfidence((data.builtAreaConfidence as SourceResult["confidence"]) ?? null);
      setSources(Array.isArray(data.sources) ? (data.sources as SourceResult[]) : []);
    } catch (e) {
      console.warn("units lookup error", e);
    } finally {
      if (reqId === lookupReqRef.current) setUnitsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedPlot) {
      setUnitsSource(null);
      setUnitsConfidence(null);
      setFloorsSource(null);
      setFloorsConfidence(null);
      setBuiltAreaSource(null);
      setBuiltAreaConfidence(null);
      setExistingBuiltArea("");
      setSources([]);
      return;
    }
    runLookup(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlot]);


  const saveManualUnits = async () => {
    if (!selectedPlot) return;
    const u = Number(existingUnits);
    const f = Number(existingFloors);
    const a = Number(existingBuiltArea);
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
          manualBuiltArea: a > 0 ? a : undefined,
        },
      });
      if (error || data?.error) {
        toast.error(error?.message || data?.error || "שגיאה בשמירה");
        return;
      }
      setUnitsSource("manual");
      if (a > 0) setBuiltAreaSource("manual");
      toast.success("הנתון נשמר ויהיה זמין לכל המשתמשים");
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בשמירה");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlot) return;
    const ba = Number(existingBuiltArea);
    const fs = Number(frontSetback);
    const ss = Number(sideSetback);
    const rs = Number(rearSetback);
    const std = DEFAULT_SETBACKS[quarter];
    const isManual = fs !== std.front || ss !== std.side || rs !== std.rear;
    const outOfRange = [fs, ss, rs].some((v) => v < 0 || v > 15);
    onAnalyze({
      quarter,
      gush: selectedPlot.gush,
      helka: selectedPlot.helka,
      area: selectedPlot.area,
      shapeArea: selectedPlot.shapeArea,
      existingUnits: Number(existingUnits) || 0,
      existingFloors: Number(existingFloors) || 0,
      existingBuiltAreaSqm: ba > 0 ? ba : undefined,
      existingBuiltAreaSource: ba > 0 ? builtAreaSource ?? undefined : undefined,
      existingBuiltAreaConfidence: ba > 0 ? builtAreaConfidence ?? undefined : undefined,
      conservation,
      notes: notes.trim() || undefined,
      frontSetbackM: fs >= 0 ? fs : undefined,
      sideSetbackM: ss >= 0 ? ss : undefined,
      rearSetbackM: rs >= 0 ? rs : undefined,
      setbackSource: !isManual ? "regulation" : outOfRange ? "manual_override" : "manual",
    });
  };

  return (
    <Card className="p-6 shadow-card">
      <Tabs value={mode} onValueChange={(v) => setMode(v as "address" | "manual")} className="mb-5">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="address">
            <MapPin className="ms-2 h-4 w-4" />
            חיפוש לפי כתובת
          </TabsTrigger>
          <TabsTrigger value="manual">
            <Search className="ms-2 h-4 w-4" />
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
                    <Search className="ms-2 h-4 w-4" />
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
              const q = Number(v) as 3 | 4;
              setQuarter(q);
              setGushQuery("");
              setHelka("");
              // טען קווי בניין מהתקנון של הרובע החדש (רק אם המשתמש לא דרס ידנית)
              if (!setbackTouched) {
                setFrontSetback(String(DEFAULT_SETBACKS[q].front));
                setSideSetback(String(DEFAULT_SETBACKS[q].side));
                setRearSetback(String(DEFAULT_SETBACKS[q].rear));
              }
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

        {/* קווי בניין ותכסית — נגזרת מהתקנון, ניתנת לעריכה */}
        {(() => {
          const std = DEFAULT_SETBACKS[quarter];
          const fs = Number(frontSetback);
          const ss = Number(sideSetback);
          const rs = Number(rearSetback);
          const plotArea = selectedPlot?.area ?? selectedPlot?.shapeArea ?? 0;
          const floorArea = estimateTypicalFloorArea(plotArea, { front: fs, side: ss, rear: rs });
          const cov = coveragePct(floorArea, plotArea);
          const isManual = fs !== std.front || ss !== std.side || rs !== std.rear;
          const outOfRange = [fs, ss, rs].some((v) => Number.isNaN(v) || v < 0 || v > 15);
          const covWarn = plotArea > 0 && (cov > 70 || cov < 15);
          const resetToDefaults = () => {
            setFrontSetback(String(std.front));
            setSideSetback(String(std.side));
            setRearSetback(String(std.rear));
            setSetbackTouched(false);
          };
          const onSetbackChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
            setter(e.target.value.replace(/[^\d.]/g, ""));
            setSetbackTouched(true);
          };
          return (
            <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
              {/* קווי בניין */}
              <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm font-medium">קווי בניין (מ׳)</Label>
                  <Badge
                    variant="outline"
                    className={`gap-1 text-[10px] ${
                      outOfRange
                        ? "text-amber-600 dark:text-amber-400"
                        : isManual
                          ? "text-muted-foreground"
                          : "text-primary"
                    }`}
                  >
                    <BookOpen className="h-3 w-3" />
                    {outOfRange ? "ידני (חריגה)" : isManual ? "ידני" : "תקנון"}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="set-front" className="text-xs text-muted-foreground">קדמי</Label>
                    <Input
                      id="set-front"
                      inputMode="decimal"
                      value={frontSetback}
                      onChange={onSetbackChange(setFrontSetback)}
                      className="h-9 text-center tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="set-side" className="text-xs text-muted-foreground">צדדי</Label>
                    <Input
                      id="set-side"
                      inputMode="decimal"
                      value={sideSetback}
                      onChange={onSetbackChange(setSideSetback)}
                      className="h-9 text-center tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="set-rear" className="text-xs text-muted-foreground">אחורי</Label>
                    <Input
                      id="set-rear"
                      inputMode="decimal"
                      value={rearSetback}
                      onChange={onSetbackChange(setRearSetback)}
                      className="h-9 text-center tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>מקור: {std.plan} · {std.section}</span>
                  {isManual && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[11px]"
                      onClick={resetToDefaults}
                    >
                      <RotateCcw className="h-3 w-3" />
                      ערכי תקנון
                    </Button>
                  )}
                </div>
              </div>

              {/* תכסית מחושבת */}
              <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
                <Label className="text-sm font-medium">תכסית מחושבת</Label>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">שטח מגרש</span>
                    <span className="tabular-nums">
                      {plotArea > 0 ? `${plotArea.toLocaleString("he-IL")} מ״ר` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">שטח קומה טיפוסית</span>
                    <span className="tabular-nums font-medium">
                      {floorArea > 0 ? `~${floorArea.toLocaleString("he-IL")} מ״ר` : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-1.5">
                    <span className="text-muted-foreground">תכסית אפקטיבית</span>
                    <span
                      className={`tabular-nums font-semibold ${
                        covWarn ? "text-amber-600 dark:text-amber-400" : "text-primary"
                      }`}
                    >
                      {floorArea > 0 ? `${cov}%` : "—"}
                    </span>
                  </div>
                </div>
                <p className="pt-1 text-[11px] text-muted-foreground">
                  {covWarn
                    ? "⚠ התוצאה חורגת מתחום סביר (15%–70%) — ודא קווי בניין"
                    : "⚠ קירוב למגרש מלבני — צורת המגרש בפועל עשויה לתת ±15%"}
                </p>
              </div>
            </div>
          );
        })()}


        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="units">יח"ד קיימות</Label>
            <div className="flex items-center gap-1">
              {unitsLoading ? (
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  מאתר...
                </Badge>
              ) : unitsSource ? (
                (() => {
                  const meta = SOURCE_META[unitsSource] ?? SOURCE_META.estimate;
                  const Icon = meta.icon;
                  const conf = unitsConfidence ? CONFIDENCE_META[unitsConfidence] : null;
                  return (
                    <>
                      <Badge variant="outline" className={`gap-1 text-[10px] ${meta.tone}`}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                      {conf && (
                        <Badge variant="outline" className={`text-[10px] ${conf.tone}`}>
                          {conf.label}
                        </Badge>
                      )}
                    </>
                  );
                })()
              ) : null}
            </div>
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
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="floors">קומות קיימות</Label>
            {floorsSource && (() => {
              const meta = SOURCE_META[floorsSource] ?? SOURCE_META.estimate;
              const Icon = meta.icon;
              const conf = floorsConfidence ? CONFIDENCE_META[floorsConfidence] : null;
              return (
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className={`gap-1 text-[10px] ${meta.tone}`}>
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </Badge>
                  {conf && (
                    <Badge variant="outline" className={`text-[10px] ${conf.tone}`}>
                      {conf.label}
                    </Badge>
                  )}
                </div>
              );
            })()}
          </div>
          <Input
            id="floors"
            inputMode="numeric"
            value={existingFloors}
            onChange={(e) => setExistingFloors(e.target.value.replace(/\D/g, ""))}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="builtArea">שטח בנוי קיים (מ"ר)</Label>
            {builtAreaSource && (() => {
              const meta = SOURCE_META[builtAreaSource] ?? SOURCE_META.estimate;
              const Icon = meta.icon;
              const conf = builtAreaConfidence ? CONFIDENCE_META[builtAreaConfidence] : null;
              return (
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className={`gap-1 text-[10px] ${meta.tone}`}>
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </Badge>
                  {conf && (
                    <Badge variant="outline" className={`text-[10px] ${conf.tone}`}>
                      {conf.label}
                    </Badge>
                  )}
                </div>
              );
            })()}
          </div>
          <Input
            id="builtArea"
            inputMode="numeric"
            placeholder='לדוגמה 720'
            value={existingBuiltArea}
            onChange={(e) => {
              setExistingBuiltArea(e.target.value.replace(/\D/g, ""));
              if (builtAreaSource && builtAreaSource !== "manual") setBuiltAreaSource(null);
            }}
          />
          <p className="text-xs text-muted-foreground">
            שטח בנוי כולל מעל הקרקע. נשאב מהיתרי עיריית ת"א / GovMap / נדל"ן כשאפשרי, ומשמש לחישוב עלות חיזוק בתמ"א 38 ולמכפיל הזכויות.
          </p>
        </div>

        {selectedPlot && sources.length > 0 && (
          <div className="md:col-span-2">
            <Collapsible open={diagOpen} onOpenChange={setDiagOpen}>
              <div className="flex items-center justify-between gap-2">
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground">
                    <Activity className="h-3.5 w-3.5" />
                    מקורות נתונים ({sources.filter((s) => s.status === "ok").length}/{sources.length} הצליחו)
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${diagOpen ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => runLookup(true)} disabled={unitsLoading}>
                  <RefreshCw className={`h-3.5 w-3.5 ${unitsLoading ? "animate-spin" : ""}`} />
                  רענן מהמקור
                </Button>
              </div>
              <CollapsibleContent className="mt-2 overflow-hidden rounded-lg border bg-muted/20">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-end font-medium">מקור</th>
                      <th className="px-2 py-1.5 text-center font-medium">סטטוס</th>
                      <th className="px-2 py-1.5 text-center font-medium">יח"ד</th>
                      <th className="px-2 py-1.5 text-center font-medium">קומות</th>
                      <th className="px-2 py-1.5 text-center font-medium">זמן</th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((s, i) => {
                      const { Icon, tone } = STATUS_ICON[s.status];
                      return (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-1.5">
                            <div className="font-medium">{s.label}</div>
                            <div className="text-[10px] text-muted-foreground">{s.detail}</div>
                            {s.errorMsg && <div className="text-[10px] text-destructive">{s.errorMsg}</div>}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <Icon className={`mx-auto h-3.5 w-3.5 ${tone}`} />
                          </td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{s.units ?? "—"}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums">{s.floors ?? "—"}</td>
                          <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">
                            {s.durationMs > 0 ? `${s.durationMs}ms` : "—"}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {s.raw != null && (
                              <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setRawDialog(s)}>
                                Raw
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {selectedPlot && unitsSource && unitsSource !== "manual" && (
          <div className="md:col-span-2 flex items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/20 px-4 py-2.5 text-xs">
            <span className="text-muted-foreground">
              הנתון אינו מאומת — אם ידוע לך הערך הנכון, תקן/י ושמור כדי לעדכן את הקאש לכל המשתמשים.
            </span>
            <Button type="button" size="sm" variant="outline" onClick={saveManualUnits} className="shrink-0">
              <Database className="ms-1.5 h-3.5 w-3.5" />
              שמור כמאומת
            </Button>
          </div>
        )}

        <Dialog open={!!rawDialog} onOpenChange={(o) => !o && setRawDialog(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{rawDialog?.label} — נתונים גולמיים</DialogTitle>
            </DialogHeader>
            {rawDialog?.source === "tlv_permits" && rawDialog.raw && typeof rawDialog.raw === "object" ? (
              <div className="max-h-[60vh] overflow-auto space-y-3">
                {(() => {
                  const r = rawDialog.raw as {
                    summary?: { builtUnits: number; approvedUnits: number };
                    chosen?: Array<{
                      physicalStatus: "built" | "approved" | "in_process" | "unknown";
                      ms_tik_binyan?: number | null;
                      yechidot_diyur?: number | null;
                      building_stage?: string | null;
                      permission_date?: string | null;
                      tama38?: string | null;
                      tama38_new?: string | null;
                      tama38_addition?: string | null;
                      addresses?: string | null;
                    }>;
                  };
                  const statusMeta: Record<string, { label: string; cls: string }> = {
                    built: { label: "קיים בפועל", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
                    approved: { label: "מאושר - לא בהכרח נבנה", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
                    in_process: { label: "בתהליך היתר", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
                    unknown: { label: "—", cls: "bg-muted text-muted-foreground" },
                  };
                  const tamaLabel = (c: { tama38?: string | null; tama38_new?: string | null; tama38_addition?: string | null }) => {
                    const parts: string[] = [];
                    if (c.tama38_new && c.tama38_new !== "לא") parts.push("חדש");
                    if (c.tama38_addition && c.tama38_addition !== "לא") parts.push("תוספת");
                    if (!parts.length && c.tama38 && c.tama38 !== "לא") parts.push(c.tama38);
                    return parts.length ? parts.join(", ") : "—";
                  };
                  return (
                    <>
                      {r.summary && (
                        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                          <span className="font-medium">בנוי בפועל:</span>{" "}
                          <span className="text-emerald-700 dark:text-emerald-300">{r.summary.builtUnits} יח"ד</span>
                          {" · "}
                          <span className="font-medium">מאושר נוסף:</span>{" "}
                          <span className="text-amber-700 dark:text-amber-300">{r.summary.approvedUnits} יח"ד</span>
                        </div>
                      )}
                      <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-2 py-1 text-end font-medium">תיק בניין</th>
                              <th className="px-2 py-1 text-end font-medium">יח"ד</th>
                              <th className="px-2 py-1 text-end font-medium">סטטוס פיזי</th>
                              <th className="px-2 py-1 text-end font-medium">תאריך היתר</th>
                              <th className="px-2 py-1 text-end font-medium">תמ"א 38</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(r.chosen ?? []).map((c, i) => {
                              const m = statusMeta[c.physicalStatus] ?? statusMeta.unknown;
                              return (
                                <tr key={i} className="border-t">
                                  <td className="px-2 py-1.5">{c.ms_tik_binyan ?? "—"}</td>
                                  <td className="px-2 py-1.5 font-medium">{c.yechidot_diyur ?? "—"}</td>
                                  <td className="px-2 py-1.5">
                                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${m.cls}`}>{m.label}</span>
                                    {c.building_stage && (
                                      <div className="mt-0.5 text-[10px] text-muted-foreground">{c.building_stage}</div>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5 text-muted-foreground">{c.permission_date ?? "—"}</td>
                                  <td className="px-2 py-1.5 text-muted-foreground">{tamaLabel(c)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">JSON גולמי מלא</summary>
                        <pre dir="ltr" className="mt-2 max-h-[30vh] overflow-auto rounded bg-muted p-3 text-[11px] leading-tight">
                          {JSON.stringify(rawDialog.raw, null, 2)}
                        </pre>
                      </details>
                    </>
                  );
                })()}
              </div>
            ) : (
              <pre dir="ltr" className="max-h-[60vh] overflow-auto rounded bg-muted p-3 text-[11px] leading-tight">
                {rawDialog ? JSON.stringify(rawDialog.raw, null, 2) : ""}
              </pre>
            )}
          </DialogContent>
        </Dialog>


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
                <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                מנתח את החלקה...
              </>
            ) : (
              <>
                <Sparkles className="ms-2 h-4 w-4" />
                הפק דוח היתכנות
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
};
