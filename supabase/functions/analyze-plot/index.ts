// Urban Renewal feasibility analyst — calls Lovable AI Gateway
// CORS handled manually (compatible with all SDK versions)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PlotInput {
  quarter: 3 | 4;
  gush: number;
  helka: number;
  area: number | null;
  shapeArea: number | null;
  existingUnits: number;
  existingFloors: number;
  conservation: boolean;
  notes?: string;
}

const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "render_feasibility_report",
    description: "Return a structured urban-renewal feasibility report for a Tel Aviv plot.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["high_potential", "medium_potential", "high_risk", "blocked"],
          description: "Overall feasibility status",
        },
        statusLabel: { type: "string", description: "Hebrew label for the status badge" },
        headline: { type: "string", description: "One sentence headline summary in Hebrew" },
        existing: {
          type: "object",
          properties: {
            units: { type: "number" },
            floors: { type: "number" },
            builtAreaSqm: { type: "number" },
            far: { type: "number", description: "Floor Area Ratio" },
          },
          required: ["units", "floors", "builtAreaSqm", "far"],
          additionalProperties: false,
        },
        proposed: {
          type: "object",
          properties: {
            units: { type: "number" },
            floors: { type: "number" },
            builtAreaSqm: { type: "number" },
            far: { type: "number" },
            heightMeters: { type: "number" },
          },
          required: ["units", "floors", "builtAreaSqm", "far", "heightMeters"],
          additionalProperties: false,
        },
        metrics: {
          type: "object",
          properties: {
            multiplier: { type: "number", description: "New units / Existing units" },
            newUnits: { type: "number", description: "Net additional units" },
            estimatedSellableArea: { type: "number", description: "Estimated sellable area in sqm" },
            avgUnitSize: { type: "number" },
          },
          required: ["multiplier", "newUnits", "estimatedSellableArea", "avgUnitSize"],
          additionalProperties: false,
        },
        zoning: {
          type: "object",
          properties: {
            maxHeightMeters: { type: "number" },
            maxFloors: { type: "number" },
            frontSetbackM: { type: "number" },
            sideSetbackM: { type: "number" },
            rearSetbackM: { type: "number" },
            maxFAR: { type: "number" },
            source: { type: "string", description: "PDF document cited" },
          },
          required: ["maxHeightMeters", "maxFloors", "frontSetbackM", "sideSetbackM", "rearSetbackM", "maxFAR", "source"],
          additionalProperties: false,
        },
        redFlags: {
          type: "array",
          items: {
            type: "object",
            properties: {
              level: { type: "string", enum: ["critical", "warning", "info"] },
              title: { type: "string" },
              description: { type: "string" },
              source: { type: "string" },
            },
            required: ["level", "title", "description", "source"],
            additionalProperties: false,
          },
        },
        committeeSummary: {
          type: "string",
          description: "3-5 sentence Investment Committee summary in Hebrew",
        },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "List of PDF documents cited",
        },
      },
      required: [
        "status",
        "statusLabel",
        "headline",
        "existing",
        "proposed",
        "metrics",
        "zoning",
        "redFlags",
        "committeeSummary",
        "sources",
      ],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `אתה אנליסט בכיר להתחדשות עירונית, מומחה לתל אביב (רובעים 3 ו-4).
המטרה: לספק הערכת היתכנות מהירה ומבוססת נתונים ליזמי נדל"ן.

מסמכי המקור הזמינים:
- "תקנון רובע 3 (תא/3616א)" — חל על רובע 3
- "תקנון רובע 4 (תא/3729א)" — חל על רובע 4
- "תכנית מתאר תא/5000" — תכנית מתאר עירונית
- "מסמך מדיניות חניה ת"א, מהדורה 8" — חניה ופיתוח מגרש
- "תכנית מתאר מקומית ת"א — מרתפים"

עקרונות חישוב מקובלים (כשאין נתון מדויק):
- רובע 3 ו-4: זכויות בנייה טיפוסיות 200%-280% (כולל מרפסות), עד 6-8 קומות + קומת גג חלקית
- מכפיל יח"ד טיפוסי בפינוי-בינוי: 2.5x-4x; בתמ"א 38: 1.3x-2x
- שטח דירה ממוצע מוצע: 90-110 מ"ר ברוטו
- חזית מסחרית מותרת לאורך רחובות מסחר ראשיים
- ברובעים 3 ו-4 קיימת מגבלת חניה משמעותית; אין בריכות; ללא גימור עץ/אבן בגדרות

דגלים אדומים שיש לזהות תמיד:
1. שימור (מבני שימור / איזור הכרזת UNESCO ב"עיר הלבנה")
2. מגבלות חניה (סעיפים 10-12 במדיניות החניה)
3. גודל מגרש קטן מ-500 מ"ר → מגביל משמעותית התחדשות
4. מגרש פינתי / חזית מסחרית → השפעה על קווי בניין

הוראות פלט:
- תמיד החזר באמצעות הכלי render_feasibility_report
- כל המספרים ריאליסטיים ומבוססים על המסמכים
- ציין מקור ספציפי בכל red flag ובשדה sources
- אם נתון חסר — ציין "נדרשת בדיקה ידנית בתיק מהנדס העיר" בתיאור הדגל המתאים
- כתוב בעברית מקצועית ותמציתית`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as PlotInput;

    if (!body || !body.quarter || !body.gush || !body.helka) {
      return new Response(JSON.stringify({ error: "missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPrompt = `נתח את ההיתכנות להתחדשות עירונית של החלקה הבאה:

רובע: ${body.quarter}
גוש: ${body.gush}
חלקה: ${body.helka}
שטח רשום: ${body.area ?? "לא ידוע"} מ"ר
שטח לפי GIS: ${body.shapeArea ?? "לא ידוע"} מ"ר
מספר יח"ד קיימות: ${body.existingUnits}
מספר קומות קיים: ${body.existingFloors}
סטטוס שימור (לפי המשתמש): ${body.conservation ? "כן" : "לא ידוע / לא"}
${body.notes ? `הערות נוספות: ${body.notes}` : ""}

החזר דוח היתכנות מלא ומובנה דרך הכלי render_feasibility_report.
חשב את המכפיל, יח"ד חדשות, שטח מכירה משוער, וזהה דגלים אדומים רלוונטיים.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [ANALYSIS_TOOL],
        tool_choice: { type: "function", function: { name: "render_feasibility_report" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "חרגת ממכסת בקשות בדקה — נסה שוב בעוד רגע" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "אזל הקרדיט בחשבון Lovable AI — יש להוסיף קרדיט בהגדרות" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response", JSON.stringify(aiJson));
      return new Response(JSON.stringify({ error: "AI did not return structured report" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let report;
    try {
      report = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool args", e, toolCall.function.arguments);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-plot error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
