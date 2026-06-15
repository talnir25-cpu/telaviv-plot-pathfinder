import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Zone {
  zone_label: string;
  location_description: string;
  max_far: number;
  max_floors_above: number;
  max_floors_roof: number;
  max_coverage_pct: number;
  density_coefficient_sqm_per_unit: number;
  rova_plan_far_bonus: number;
  plot_size_condition: string | null;
}

interface ExtractResult {
  quarter: number;
  zones: Zone[];
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const sqlEscape = (v: string | null) =>
  v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`;

const buildSql = (result: ExtractResult): string => {
  return result.zones
    .map((z) => {
      const planCode = `rova_${result.quarter}_auto`;
      return `UPDATE public.zoning_rights SET
  max_far = ${z.max_far},
  max_floors_above = ${z.max_floors_above},
  max_floors_roof = ${z.max_floors_roof},
  coverage_pct = ${z.max_coverage_pct},
  density_coefficient_sqm_per_unit = ${z.density_coefficient_sqm_per_unit},
  rova_plan_far_bonus = ${z.rova_plan_far_bonus},
  notes = ${sqlEscape(z.location_description + (z.plot_size_condition ? ` | תנאי: ${z.plot_size_condition}` : ""))}
WHERE quarter = ${result.quarter} AND zone_label = ${sqlEscape(z.zone_label)} AND plan_code = ${sqlEscape(planCode)};`;
    })
    .join("\n\n");
};

export default function ZoningRightsExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [quarter, setQuarter] = useState<3 | 4>(3);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleExtract = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const { data, error: fnError } = await supabase.functions.invoke(
        "extract-zoning-rights",
        { body: { quarter, imageBase64 } }
      );
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setResult(data as ExtractResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleCopySql = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(buildSql(result));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4" dir="rtl">
      <h2 className="text-2xl font-bold">חילוץ זכויות בנייה מטבלת תקנון</h2>

      <div className="flex flex-wrap items-center gap-4 bg-gray-50 p-4 rounded border">
        <div>
          <label className="block text-sm font-medium mb-1">תמונת טבלה</label>
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">רובע</label>
          <select
            value={quarter}
            onChange={(e) => setQuarter(Number(e.target.value) as 3 | 4)}
            className="border rounded px-2 py-1"
          >
            <option value={3}>רובע 3</option>
            <option value={4}>רובע 4</option>
          </select>
        </div>
        <button
          onClick={handleExtract}
          disabled={!file || loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "מחלץ…" : "חלץ זכויות"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
          שגיאה: {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              תוצאות — רובע {result.quarter} ({result.zones.length} שורות)
            </h3>
            <button
              onClick={handleCopySql}
              className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700"
            >
              {copied ? "הועתק ✓" : "העתק SQL"}
            </button>
          </div>
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-right">ייעוד</th>
                  <th className="p-2 text-right">מיקום</th>
                  <th className="p-2">FAR</th>
                  <th className="p-2">קומות</th>
                  <th className="p-2">גג</th>
                  <th className="p-2">תכסית %</th>
                  <th className="p-2">מ"ר/דירה</th>
                  <th className="p-2">בונוס רובע</th>
                  <th className="p-2 text-right">תנאי מגרש</th>
                </tr>
              </thead>
              <tbody>
                {result.zones.map((z, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{z.zone_label}</td>
                    <td className="p-2">{z.location_description}</td>
                    <td className="p-2 text-center">{z.max_far}</td>
                    <td className="p-2 text-center">{z.max_floors_above}</td>
                    <td className="p-2 text-center">{z.max_floors_roof}</td>
                    <td className="p-2 text-center">{z.max_coverage_pct}</td>
                    <td className="p-2 text-center">{z.density_coefficient_sqm_per_unit}</td>
                    <td className="p-2 text-center">{z.rova_plan_far_bonus}</td>
                    <td className="p-2">{z.plot_size_condition ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
