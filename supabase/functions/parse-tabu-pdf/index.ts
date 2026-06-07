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
          highestAboveGround: { type: "number", description: "מספר הקומה הגבוהה ביותר מעל הקרקע (א=1, ב=2, ...). אם רק קרקע — 0." },
        },
        required: ["labels", "hasGround", "hasRoof", "hasBasement", "highestAboveGround"],
      },
      floorsExplain: { type: "string", description: "הסבר קצר בעברית על אופן ספירת הקומות." },
      floorsExplicit: { type: ["number", "null"], description: "מספר הקומות אם מצוין במפורש בנסח (למשל 'בית בן X קומות' בתיאור הנכס/רכוש משותף). null אם לא מצוין." },
    },
    required: ["units", "floors", "avgUnitSize", "plotArea", "coverageRatio", "buildingYear", "warnings", "hasActiveRenewal", "renewalParty", "floorsDetected", "floorsExplain", "floorsExplicit"],
  },
};

const SYSTEM_PROMPT = `אתה מומחה בניתוח נסחי טאבו ישראליים. נתח את הטקסט שחולץ מהנסח ושלוף בדיוק:
1. מספר תת-חלקות של דירות = מספר יחידות דיור (אל תספור חניות/מחסנים נפרדים).
2. **מספר קומות פיזיות** — לפי סדר העדיפויות הבא:
   א. **floorsExplicit** — אם הנסח מציין במפורש בתיאור הנכס/רכוש משותף "בית בן X קומות" או "בניין בן X קומות" — החזר את X. זה הערך הסמכותי.
   ב. אחרת — חשב מתוך תוויות הקומות בתת-חלקות:
      - אסוף את תוויות הקומות הייחודיות: קרקע, ראשונה(=א), שניה(=ב), שלישית(=ג), רביעית(=ד), חמישית(=ה), שישית(=ו), גג, מרתף.
      - **חשוב מאוד**: בנסחי טאבו ישראליים רבים "קומה ראשונה" היא **קומת הכניסה = קומת קרקע** (לא קומה מעליה). אם בנסח מופיעות הן "קרקע" והן "ראשונה" באותו בניין — סביר שאלה אותה קומה פיזית; אל תספור פעמיים. בדוק את ההקשר.
      - highestAboveGround = המספר של הקומה הגבוהה ביותר מעל הקרקע (ראשונה=1 או 0 לפי הפרשנות לעיל; שניה=2; וכו').
      - floors = highestAboveGround + (1 אם יש קומת גג נפרדת) + (1 אם יש קרקע **ו**אין "ראשונה" באותו בניין).
      - מרתף אינו נספר.
   ג. החזר גם floorsDetected מלא לאימות, וגם floorsExplain קצר (עד 200 תווים).
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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY missing" }), {
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

    // 2. text → Claude extraction
    const truncated = pdfText.length > 60_000 ? pdfText.slice(0, 60_000) : pdfText;
    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
        messages: [
          { role: "user", content: `טקסט שחולץ מנסח הטאבו:\n\n${truncated}` },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "חרגת ממכסת בקשות Anthropic — נסה שוב בעוד מספר דקות" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("Anthropic error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "שגיאה בשירות ה-AI", details: t.slice(0, 300) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolUse = Array.isArray(aiJson?.content)
      ? aiJson.content.find((b: { type: string }) => b.type === "tool_use")
      : null;
    const raw = toolUse?.input;
    if (!raw) {
      console.error("no tool_use", JSON.stringify(aiJson).slice(0, 500));
      return new Response(JSON.stringify({ error: "ה-AI לא החזיר נתונים מובְנים" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof raw.floorsExplain === "string" && raw.floorsExplain.length > 2000) {
      raw.floorsExplain = raw.floorsExplain.slice(0, 2000);
    }
    // Recompute floors with priority: explicit > smart-derived from labels
    if (typeof raw.floorsExplicit === "number" && raw.floorsExplicit > 0) {
      raw.floors = raw.floorsExplicit;
      raw.floorsExplain = `מצוין במפורש בנסח: ${raw.floorsExplicit} קומות`;
    } else if (raw.floorsDetected) {
      const fd = raw.floorsDetected;
      const labels: string[] = Array.isArray(fd.labels) ? fd.labels : [];
      const hasFirst = labels.some((l) => /ראשונה|^\s*א\s*'?\s*$/.test(String(l)));
      const high = Number(fd.highestAboveGround) || 0;
      const roof = fd.hasRoof ? 1 : 0;
      // אם יש "ראשונה" — היא כבר מייצגת את הקומה הראשונה הפיזית (פעמים רבות = קרקע),
      // ולכן לא מוסיפים +1 עבור קרקע. אחרת — מוסיפים את הקרקע אם קיימת.
      const ground = (fd.hasGround && !hasFirst) ? 1 : 0;
      const computed = high + roof + ground;
      if (computed > 0) raw.floors = computed;
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
