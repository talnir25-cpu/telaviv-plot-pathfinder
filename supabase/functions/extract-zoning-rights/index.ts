import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXTRACTION_PROMPT = `אתה מנתח תכנוני מומחה. מולך טבלת זכויות בנייה מתקנון רובע בתל אביב.

חלץ את כל השורות מהטבלה והחזר JSON בפורמט הבא בלבד (ללא טקסט נוסף):

{
  "zones": [
    {
      "zone_label": "<שם הייעוד>",
      "location_description": "<תיאור מיקום>",
      "max_far": <יחס בנייה כמספר שלם, למשל 280 עבור 2.80>,
      "max_floors_above": <קומות מעל כניסה>,
      "max_floors_roof": <קומות גג, 0 אם אין>,
      "max_coverage_pct": <תכסית כאחוז שלם, למשל 55>,
      "density_coefficient_sqm_per_unit": <מ"ר לדירה>,
      "rova_plan_far_bonus": <בונוס FAR לתכנית רובעית, 0 אם לא מצוין>,
      "plot_size_condition": "<תנאי גודל מגרש אם קיים, null אחרת>"
    }
  ]
}

החזר JSON בלבד ללא עטיפת \`\`\`json.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { quarter, imageBase64 } = await req.json();

    const client = new Anthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    });

    const raw = (response.content[0] as any).text.trim();
    const parsed = JSON.parse(raw);

    return new Response(
      JSON.stringify({ quarter, ...parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
