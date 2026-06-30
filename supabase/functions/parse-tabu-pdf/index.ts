// Parse Israeli Tabu (land registry) PDF — extracts structured planning data.
// Uses Lovable AI Gateway (openai/gpt-5) for the extraction step.


import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  fileBase64: z.string().min(100, "PDF base64 is required"),
  filename: z.string().max(255).optional(),
});

const ResultSchema = z.object({
  units: z.number().int().min(0).max(500),
  floors: z.number().int().min(0).max(60),
  avgUnitSize: z.number().min(0).max(1000),
  plotArea: z.number().min(0).max(200_000),
  coverageRatio: z.number().min(0).max(100),
  buildingYear: z.number().int().min(1900).max(2030).nullable(),
  warnings: z.array(z.object({
    text: z.string().max(500),
    party: z.string().max(200),
    year: z.number().int().min(1900).max(2100),
  })).max(50),
  hasActiveRenewal: z.boolean(),
  renewalParty: z.string().max(200).nullable(),
  floorsDetected: z.object({
    labels: z.array(z.string().max(40)).max(30),
    hasGround: z.boolean(),
    hasRoof: z.boolean(),
    hasBasement: z.boolean(),
    highestAboveGround: z.number().int().min(0).max(60),
  }).optional(),
  floorsExplain: z.string().max(2000).optional(),
  floorsExplicit: z.number().int().min(0).max(60).nullable().optional(),
  typicalFloorArea: z.number().min(0).max(20_000).nullable().optional(),
  commonPropertyShares: z.array(z.number().min(0).max(100_000)).max(500).optional(),
  commonPropertyDenominator: z.number().min(0).max(1_000_000).nullable().optional(),
  validation: z.object({
    sharesValid: z.boolean(),
    sharesMessage: z.string().max(500),
  }).optional(),
});

const EXTRACTION_TOOL = {
  name: "extract_tabu_data",
  description: "Extracts structured planning data from an Israeli Tabu (Nesach) document.",
  input_schema: {
    type: "object",
    properties: {
      units: { type: "number", description: "Number of dwelling units = number of sub-parcels (תת-חלקות)." },
      floors: { type: "number", description: "Total number of physical floors above ground in the building (כולל קרקע, כולל קומת גג/חדר על הגג אם קיימים; לא כולל מרתף)." },
      avgUnitSize: { type: "number", description: "Average unit size in sqm." },
      plotArea: { type: "number", description: "Plot area in sqm (from common property section)." },
      coverageRatio: { type: "number", description: "Coverage % = typical floor area / plot area * 100." },
      buildingYear: { type: ["number", "null"], description: "Year of condominium registration deed, or null." },
      warnings: {
        type: "array",
        description: "All cautionary notes (הערות אזהרה).",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            party: { type: "string", description: "Beneficiary party name." },
            year: { type: "number" },
          },
          required: ["text", "party", "year"],
        },
      },
      hasActiveRenewal: { type: "boolean", description: "True if a cautionary note relates to an active urban renewal (תמ\"א/פינוי-בינוי/התחדשות) process." },
      renewalParty: { type: ["string", "null"], description: "Name of the renewal developer / party, if hasActiveRenewal." },
      floorsDetected: {
        type: "object",
        description: "פירוט הקומות שזוהו בנסח, לצורך אימות.",
        properties: {
          labels: { type: "array", items: { type: "string" }, description: "כל תוויות הקומות הייחודיות שמופיעות בתת-חלקות (למשל: 'קרקע','א','ב','ג','גג','מרתף')." },
          hasGround: { type: "boolean", description: "האם מופיעה דירה/יחידה בקומת קרקע." },
          hasRoof: { type: "boolean", description: "האם מופיעה יחידה בקומת גג / חדר על הגג." },
          hasBasement: { type: "boolean", description: "האם מופיע מרתף." },
          highestAboveGround: { type: "number", description: "מספר תווית הקומה הגבוהה ביותר שמופיעה (ראשונה/א=1, שניה/ב=2, שלישית/ג=3, ...). אם רק קרקע — 0." },
        },
        required: ["labels", "hasGround", "hasRoof", "hasBasement", "highestAboveGround"],
      },
      floorsExplain: { type: "string", description: "הסבר קצר בעברית על אופן ספירת הקומות." },
      floorsExplicit: { type: ["number", "null"], description: "מספר הקומות אם מצוין במפורש בנסח (למשל 'בית בן X קומות' בתיאור הנכס/רכוש משותף). null אם לא מצוין." },
      typicalFloorArea: { type: ["number", "null"], description: "שטח קומה טיפוסית במ\"ר — סכום שטחי הדירות בקומה אחת ייצוגית (לא כולל קרקע אם שונה). אם לא ניתן לחשב — null." },
      commonPropertyShares: { type: "array", items: { type: "number" }, description: "מערך של המונים של החלקים ברכוש המשותף לכל תת-חלקה (למשל אם כתוב 'X/577' החזר X). כל היחידות מאותו נסח חייבות להופיע." },
      commonPropertyDenominator: { type: ["number", "null"], description: "המכנה המשותף של החלקים ברכוש המשותף (למשל 577, 1000). אם לא ברור — null." },
    },
    required: ["units", "floors", "avgUnitSize", "plotArea", "coverageRatio", "buildingYear", "warnings", "hasActiveRenewal", "renewalParty", "floorsDetected", "floorsExplain", "floorsExplicit", "typicalFloorArea", "commonPropertyShares", "commonPropertyDenominator"],
  },
};

const SYSTEM_PROMPT = `אתה מומחה בניתוח נסחי טאבו ישראליים. נתח את הטקסט שחולץ מהנסח ושלוף בדיוק:
1. מספר תת-חלקות של דירות = מספר יחידות דיור (אל תספור חניות/מחסנים נפרדים).
2. **מספר קומות** = מספר תוויות הקומה הייחודיות בתת-חלקות, **לא כולל קרקע ולא כולל מרתף**.
   דוגמאות:
   - קרקע + ראשונה + שניה + שלישית → 3 קומות.
   - קרקע + ראשונה + שניה → 2 קומות.
   - רק קרקע → 0 קומות.
   חובה להחזיר את כל תוויות הקומה הייחודיות שזוהו בשדה floorsDetected.labels (כולל "קרקע" ו"מרתף" אם הופיעו — הסינון נעשה בצד השרת).
3. שטח ממוצע ליחידה במ"ר (סכום שטחי הדירות חלקי מספר היחידות).
4. שטח החלקה במ"ר — מהרכוש המשותף.
5. תכסית % = שטח קומה טיפוסית ÷ שטח חלקה × 100.
6. הערות אזהרה — כל הערת אזהרה: טקסט, שם הגורם הזוכה, שנה.
7. שנת בנייה = שנת שטר יצירת הבית המשותף, אם מופיעה. אחרת null.
8. hasActiveRenewal = true אם יש הערת אזהרה הקשורה להתחדשות עירונית (תמ"א 38, פינוי-בינוי, התחדשות), עם renewalParty = שם היזם.

אם מידע חסר — החזר 0 או null במקום לנחש.
החזר את הנתונים דרך הכלי extract_tabu_data בלבד.`;

function bytesFromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/^data:application\/pdf;base64,/, "").replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function floorNumberFromLabel(label: string): number | null {
  const normalized = String(label).replace(/[׳'״"\s]/g, "");
  if (/^(ראשונה|ראשון|א)$/.test(normalized)) return 1;
  if (/^(שניה|שנייה|שני|ב)$/.test(normalized)) return 2;
  if (/^(שלישית|שלישי|ג)$/.test(normalized)) return 3;
  if (/^(רביעית|רביעי|ד)$/.test(normalized)) return 4;
  if (/^(חמישית|חמישי|ה)$/.test(normalized)) return 5;
  if (/^(שישית|שישי|ו)$/.test(normalized)) return 6;
  if (/^(שביעית|שביעי|ז)$/.test(normalized)) return 7;
  if (/^(שמינית|שמיני|ח)$/.test(normalized)) return 8;
  if (/^(תשיעית|תשיעי|ט)$/.test(normalized)) return 9;
  if (/^(עשירית|עשירי|י)$/.test(normalized)) return 10;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "קלט לא תקין", details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. PDF → text
    let pdfText = "";
    try {
      const pdfBytes = bytesFromBase64(parsed.data.fileBase64);
      const doc = await getDocumentProxy(pdfBytes);
      const { text } = await extractText(doc, { mergePages: true });
      pdfText = Array.isArray(text) ? text.join("\n") : String(text ?? "");
    } catch (e) {
      console.error("PDF extraction failed", e);
      return new Response(JSON.stringify({ error: "שגיאה בקריאת קובץ ה-PDF — ייתכן שזה PDF סרוק (תמונה) שאינו נתמך כרגע" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (pdfText.trim().length < 50) {
      return new Response(JSON.stringify({ error: "לא נשלף טקסט מה-PDF — סביר שהוא סרוק (תמונה). יש לנסות נסח דיגיטלי." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. text → Lovable AI Gateway extraction (OpenAI-compatible tool calling)
    const truncated = pdfText.length > 60_000 ? pdfText.slice(0, 60_000) : pdfText;
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `טקסט שחולץ מנסח הטאבו:\n\n${truncated}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: EXTRACTION_TOOL.name,
            description: EXTRACTION_TOOL.description,
            parameters: EXTRACTION_TOOL.input_schema,
          },
        }],
        tool_choice: { type: "function", function: { name: EXTRACTION_TOOL.name } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "חרגת ממכסת בקשות AI — נסה שוב בעוד מספר דקות" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "נגמרו הקרדיטים ב-Lovable AI — יש לטעון מחדש בהגדרות החיוב" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "שגיאה בשירות ה-AI", details: t.slice(0, 300) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    const rawArgs = toolCall?.function?.arguments;
    let raw: any = null;
    if (typeof rawArgs === "string") {
      try { raw = JSON.parse(rawArgs); } catch { raw = null; }
    } else if (rawArgs && typeof rawArgs === "object") {
      raw = rawArgs;
    }
    if (!raw) {
      console.error("no tool_call", JSON.stringify(aiJson).slice(0, 500));
      return new Response(JSON.stringify({ error: "ה-AI לא החזיר נתונים מובְנים" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof raw.floorsExplain === "string" && raw.floorsExplain.length > 2000) {
      raw.floorsExplain = raw.floorsExplain.slice(0, 2000);
    }
    // Deterministic recompute: count unique floor numbers >= 1 (excludes ground/basement)
    if (raw.floorsDetected && Array.isArray(raw.floorsDetected.labels)) {
      const floorNumbers = new Set<number>();
      for (const label of raw.floorsDetected.labels) {
        const n = floorNumberFromLabel(String(label));
        if (n !== null && n >= 1) floorNumbers.add(n);
      }
      raw.floors = floorNumbers.size;
      const sorted = [...floorNumbers].sort((a, b) => a - b);
      raw.floorsExplain = `${floorNumbers.size} קומות (לא כולל קרקע/מרתף): ${sorted.join(', ')}`;
    }

    // Deterministic recompute: coverage % = typical floor area / plot area * 100
    // אם typicalFloorArea זמין מ-Claude, השתמש בו; אחרת גזור מ-avgUnitSize × יחידות-לקומה (לא כולל קרקע)
    {
      let typical = typeof raw.typicalFloorArea === "number" ? raw.typicalFloorArea : 0;
      if (!(typical > 0) && raw.avgUnitSize > 0 && raw.units > 0 && raw.floors > 0) {
        const unitsPerFloor = raw.units / (raw.floors + 1); // +1 for ground floor
        typical = raw.avgUnitSize * unitsPerFloor;
        raw.typicalFloorArea = Math.round(typical * 10) / 10;
      }
      if (raw.plotArea > 0 && typical > 0) {
        raw.coverageRatio = Math.round((typical / raw.plotArea) * 1000) / 10;
      }
    }

    // Deterministic validation: sum of common-property shares ≈ denominator → all units extracted
    if (Array.isArray(raw.commonPropertyShares) && raw.commonPropertyShares.length > 0) {
      const sumShares = raw.commonPropertyShares.reduce((a: number, b: number) => a + b, 0);
      const denominator = typeof raw.commonPropertyDenominator === "number" && raw.commonPropertyDenominator > 0
        ? raw.commonPropertyDenominator
        : 0;
      if (denominator > 0) {
        const sharesValid = Math.abs(sumShares - denominator) / denominator < 0.05;
        raw.validation = {
          sharesValid,
          sharesMessage: sharesValid
            ? `כל היחידות זוהו (סך החלקים ${sumShares}/${denominator} תקין)`
            : `אזהרה: סך החלקים ${sumShares}/${denominator} — ייתכן שחלק מהיחידות חסרות בנסח`,
        };
      } else {
        raw.validation = {
          sharesValid: false,
          sharesMessage: `לא זוהה מכנה משותף לחלקים ברכוש המשותף — לא ניתן לאמת שלמות (סכום החלקים: ${sumShares})`,
        };
      }
    }

    const result = ResultSchema.safeParse(raw);
    if (!result.success) {
      console.error("validation failed", result.error.flatten());
      return new Response(JSON.stringify({ error: "תשובת AI לא עברה ולידציה", details: result.error.flatten().fieldErrors, raw }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ analysis: result.data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-tabu-pdf error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
