// Financial feasibility analyst — calls Lovable AI Gateway
// Modes: "defaults" (suggest input values) | "analyze" (compute full financial report)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULTS_TOOL = {
  type: "function",
  function: {
    name: "suggest_financial_defaults",
    description: "Suggest realistic financial input defaults for a Tel Aviv urban renewal project.",
    parameters: {
      type: "object",
      properties: {
        avgSalePricePerSqm: { type: "number", description: "₪/sqm typical sale price for new units in this quarter" },
        buildCostPerSqm: { type: "number", description: "₪/sqm direct construction cost" },
        softCostsPct: { type: "number", description: "% soft costs over hard costs (planning, mgmt, consultants)" },
        vatPct: { type: "number" },
        loanInterestPct: { type: "number", description: "Annual % interest on construction loan" },
        constructionMonths: { type: "number" },
        tenantRentPerMonth: { type: "number", description: "₪/month rent paid per displaced tenant" },
        tenantEvacuationCost: { type: "number", description: "₪ one-time evacuation cost per tenant" },
        landValuePerSqm: { type: "number", description: "₪/sqm raw land value" },
        bettermentTaxPct: { type: "number", description: "% betterment tax over uplift" },
        rationale: { type: "string", description: "Hebrew, 1-2 sentences explaining the basis" },
      },
      required: [
        "avgSalePricePerSqm", "buildCostPerSqm", "softCostsPct", "vatPct",
        "loanInterestPct", "constructionMonths", "tenantRentPerMonth",
        "tenantEvacuationCost", "landValuePerSqm", "bettermentTaxPct", "rationale",
      ],
      additionalProperties: false,
    },
  },
};

const ANALYZE_TOOL = {
  type: "function",
  function: {
    name: "render_financial_report",
    description: "Return structured financial feasibility for a Tel Aviv urban renewal project.",
    parameters: {
      type: "object",
      properties: {
        totalSalesRevenue: { type: "number" },
        netSalesRevenue: { type: "number" },
        hardCosts: { type: "number" },
        softCosts: { type: "number" },
        tenantCosts: { type: "number" },
        bettermentTax: { type: "number" },
        permitFees: { type: "number" },
        landCost: { type: "number" },
        financingCosts: { type: "number" },
        treePreservationCost: { type: "number", description: "₪ for tree conservation/relocation/fines (0 if no trees)" },
        parkingBasementCost: { type: "number", description: "₪ extra cost for required basement parking floors beyond standard Hard cost" },
        dewateringCost: { type: "number", description: "₪ dewatering cost (0 if not required)" },
        physicalConstraintsCost: { type: "number", description: "Sum of tree + parking basement + dewatering" },
        totalProjectCost: { type: "number", description: "Includes physicalConstraintsCost" },
        developerProfit: { type: "number" },
        rocPct: { type: "number", description: "Return on Cost = profit / total cost * 100" },
        rosPct: { type: "number", description: "Return on Sales = profit / net revenue * 100" },
        irrPct: { type: "number", description: "Internal Rate of Return %" },
        breakevenPricePerSqm: { type: "number" },
        verdict: { type: "string", enum: ["profitable", "marginal", "loss"] },
        verdictLabel: { type: "string", description: "Hebrew label" },
        headline: { type: "string", description: "Hebrew 1-sentence summary" },
        sensitivity: {
          type: "array",
          description: "Exactly 9 cells: combinations of priceDelta {-5,0,5} × costDelta {-5,0,5}",
          items: {
            type: "object",
            properties: {
              priceDelta: { type: "number" },
              costDelta: { type: "number" },
              profit: { type: "number" },
              roc: { type: "number" },
            },
            required: ["priceDelta", "costDelta", "profit", "roc"],
            additionalProperties: false,
          },
        },
        notes: { type: "array", items: { type: "string" } },
      },
      required: [
        "totalSalesRevenue", "netSalesRevenue", "hardCosts", "softCosts",
        "tenantCosts", "bettermentTax", "permitFees", "landCost",
        "financingCosts",
        "treePreservationCost", "parkingBasementCost", "dewateringCost", "physicalConstraintsCost",
        "totalProjectCost", "developerProfit",
        "rocPct", "rosPct", "irrPct", "breakevenPricePerSqm",
        "verdict", "verdictLabel", "headline", "sensitivity", "notes",
      ],
      additionalProperties: false,
    },
  },
};

const SYSTEM = `אתה אנליסט פיננסי בכיר לפרויקטי התחדשות עירונית בתל אביב (רובעים 3 ו-4).
ידע שוק (2026):
- מחיר מכירה ממוצע ברובעים 3-4: 50,000-75,000 ₪/מ"ר (תלוי במיקום, חזית, קומה)
- עלות בנייה Hard: 8,500-11,000 ₪/מ"ר (פרויקטים בינוניים-גבוהים)
- Soft costs: 12-18% מ-Hard
- מע"מ: 18%
- ריבית מימון בנייה: 6-7.5% שנתי
- משך הקמה: 24-36 חודשים
- שכ"ד לדייר: 7,000-10,000 ₪/חודש
- פינוי חד-פעמי: 25,000-40,000 ₪/דייר
- היטל השבחה: 50% משווי ההשבחה
- שווי קרקע ברובעים 3-4: 35,000-55,000 ₪/מ"ר זכויות

עלויות אילוצים פיזיים-רגולטוריים:
- עצים לשימור / כופר / העתקה: 15,000-50,000 ₪ לעץ בוגר (בממוצע ~25,000 ₪)
- מרתפי חניה: כל מרתף נוסף מעבר לראשון מוסיף 80,000-120,000 ₪ ליח״ד (חפירה, דיפון, אוורור). חשב פי (מרתפים-1) × יח״ד × 100K.
- השפלת מי תהום: כאשר נדרשת — 250-450 ₪/מ״ר שטח חפירה במרתפים (בקירוב: שטח_מגרש × מרתפים × 350). ברובע 3 ליד הים — בקצה העליון.
- treePreservationCost = treesForConservation × 25,000 (אם 0 או חסר — 0)
- parkingBasementCost = max(0, requiredBasementFloors - 1) × proposedUnits × 100,000
- dewateringCost = dewateringRequired ? (plotArea × requiredBasementFloors × 350) : 0
- physicalConstraintsCost = סכום השלושה. כלול אותו ב-totalProjectCost.
- אם todReliefApplies = true, הפחת ~15% מ-parkingBasementCost (הקלת תקן).
- הוסף ל-notes שורה לכל אילוץ פעיל המסבירה את השפעתו.

החזר תמיד מספרים ריאליסטיים. כל הסכומים בשקלים.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const mode = body.mode as "defaults" | "analyze";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let userPrompt = "";
    let tool;

    if (mode === "defaults") {
      const { quarter, gush, helka, plotArea, proposedUnits, proposedBuiltArea } = body;
      userPrompt = `הצע ערכי ברירת מחדל פיננסיים לפרויקט הבא:
רובע ${quarter}, גוש ${gush}, חלקה ${helka}
שטח מגרש: ${plotArea} מ"ר
יח"ד מתוכננות: ${proposedUnits}
שטח בנייה כולל: ${proposedBuiltArea} מ"ר
החזר ערכים ריאליסטיים דרך הכלי suggest_financial_defaults.`;
      tool = DEFAULTS_TOOL;
    } else if (mode === "analyze") {
      const { plot, planning, financial } = body;
      userPrompt = `חשב היתכנות פיננסית מלאה לפרויקט.

נתוני תכנון (מהדוח התכנוני):
- שטח מגרש: ${plot.area} מ"ר
- יח"ד קיימות: ${planning.existing.units}, חדשות: ${planning.proposed.units}
- שטח בנייה מוצע (עיקרי): ${planning.proposed.builtAreaSqm} מ"ר
- שטח מכירה משוער: ${planning.metrics.estimatedSellableArea} מ"ר
- מכפיל יח"ד: ${planning.metrics.multiplier}

אילוצים פיזיים-רגולטוריים מהדוח התכנוני:
- עצים בחלקה: ${planning.zoning?.treesOnPlot ?? "לא ידוע"}, מתוכם לשימור: ${planning.zoning?.treesForConservation ?? 0}
- תקן חניה ליח״ד: ${planning.zoning?.parkingStandardPerUnit ?? "לא ידוע"}
- מרתפי חניה נדרשים: ${planning.zoning?.requiredBasementFloors ?? 1}
- הקלות TOD: ${planning.zoning?.todReliefApplies ? "כן" : "לא"}
- עומק מי תהום: ${planning.zoning?.groundwaterDepthM ?? "לא ידוע"} מ׳
- השפלת מי תהום נדרשת: ${planning.zoning?.dewateringRequired ? "כן" : "לא"}

קלט פיננסי:
- מחיר מכירה: ${financial.avgSalePricePerSqm} ₪/מ"ר
- עלות בנייה: ${financial.buildCostPerSqm} ₪/מ"ר
- Soft costs: ${financial.softCostsPct}%
- מע"מ: ${financial.vatPct}%
- הון עצמי: ${financial.equity} ₪
- ריבית הלוואה: ${financial.loanInterestPct}% שנתי
- משך הקמה: ${financial.constructionMonths} חודשים
- שכ"ד לדייר: ${financial.tenantRentPerMonth} ₪/חודש
- פינוי לדייר: ${financial.tenantEvacuationCost} ₪
- שווי קרקע: ${financial.landValuePerSqm} ₪/מ"ר
- היטל השבחה: ${financial.bettermentTaxPct}%
- רף רווח מבוקש: ${financial.targetDeveloperProfitPct}%

חישובים נדרשים:
1. פדיון = שטח_מכירה × מחיר_מ"ר. נטו = פדיון / (1+מע"מ)
2. Hard = שטח_בנייה × עלות_מ"ר; Soft = Hard × softPct
3. עלויות דיירים = יח"ד_קיימות × (פינוי + שכ"ד×חודשי_הקמה)
4. דמי היתר ≈ 1% מעלות בנייה
5. עלויות מימון: על (סה"כ_עלות - הון_עצמי), במשך חצי תקופת הקמה (תקבולי דירות מתחילים באמצע)
6. אילוצים פיזיים (ראה system prompt לנוסחאות): treePreservationCost, parkingBasementCost, dewateringCost, physicalConstraintsCost
7. סה"כ_עלות = Hard + Soft + tenant + landCost + bettermentTax + permitFees + financingCosts + physicalConstraintsCost
8. רווח = נטו - סה"כ_עלות
9. ROC = רווח/עלות; ROS = רווח/נטו; IRR ≈ הערכה מבוססת רווח/(תקופה_שנים × הון_עצמי)
10. נקודת איזון = (סה"כ_עלות × (1+מע"מ)) / שטח_מכירה
11. רגישות: לכל שילוב מ-{-5,0,+5}% במחיר × {-5,0,+5}% בעלות הבנייה — חשב רווח ו-ROC.
verdict: profitable אם ROC ≥ ${financial.targetDeveloperProfitPct}, marginal אם 0 ≤ ROC < target, אחרת loss.
החזר דרך render_financial_report.`;
      tool = ANALYZE_TOOL;
    } else {
      return new Response(JSON.stringify({ error: "invalid mode" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5.4",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: tool.function.name } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "חרגת ממכסת בקשות — נסה שוב" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "אזל הקרדיט בחשבון Lovable AI" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiJson = await aiResp.json();
    const args = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) {
      console.error("no tool call", JSON.stringify(aiJson));
      return new Response(JSON.stringify({ error: "AI did not return structured response" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const result = JSON.parse(args);
    return new Response(JSON.stringify(mode === "defaults" ? { defaults: result } : { report: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("financial-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
