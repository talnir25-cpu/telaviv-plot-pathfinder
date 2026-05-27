// Deno tests for the deterministic finance engine.
// Run: deno test supabase/functions/_shared/finance-engine.test.ts

import {
  assert,
  assertEquals,
  assertAlmostEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assembleReport, type EngineInput } from "./finance-engine.ts";

const baseInput: EngineInput = {
  projectType: "urban_renewal",
  renewalSubtype: "tama38",
  plotArea: 800,
  existingBuiltAreaSqm: 1200,
  proposedBuiltAreaSqm: 4500,
  estimatedSellableArea: 3800,
  proposedUnits: 36,
  zoning: {
    treesForConservation: 0,
    requiredBasementFloors: 1,
    todReliefApplies: false,
    dewateringRequired: false,
  },
  avgSalePricePerSqm: 65_000,
  buildCostPerSqm: 9_500,
  softCostsPct: 15,
  vatPct: 18,
  equity: 15_000_000,
  loanInterestPct: 7,
  constructionMonths: 30,
  tenantRentPerMonth: 8_500,
  tenantEvacuationCost: 30_000,
  targetDeveloperProfitPct: 15,
  landValuePerSqm: 45_000,
  bettermentTaxPct: 50,
};

Deno.test("urban_renewal: landCost is zero and betterment tax is zero", () => {
  const r = assembleReport(baseInput);
  assertEquals(r.landCost, 0);
  assertEquals(r.bettermentTax, 0);
});

Deno.test("new_construction: landCost is full, no tenant costs", () => {
  const r = assembleReport({
    ...baseInput,
    projectType: "new_construction",
  });
  assertEquals(r.tenantCosts, 0);
  assertAlmostEquals(r.landCost, 45_000 * 800, 1);
});

Deno.test("combination: landCost weighted by developer share", () => {
  const r = assembleReport({
    ...baseInput,
    projectType: "combination",
    developerLandSharePct: 60,
  });
  assertAlmostEquals(r.landCost, 45_000 * 800 * 0.6, 1);
});

Deno.test("verdict matches ROC threshold", () => {
  const profitable = assembleReport(baseInput);
  if (profitable.rocPct >= baseInput.targetDeveloperProfitPct) {
    assertEquals(profitable.verdict, "profitable");
  } else if (profitable.rocPct >= 0) {
    assertEquals(profitable.verdict, "marginal");
  } else {
    assertEquals(profitable.verdict, "loss");
  }

  // force loss with very low sale price + high cost
  const loss = assembleReport({
    ...baseInput,
    avgSalePricePerSqm: 8_000,
    buildCostPerSqm: 15_000,
  });
  assertEquals(loss.verdict, "loss");
  assert(loss.developerProfit < 0);

});

Deno.test("sensitivity center cell ≈ base scenario", () => {
  const r = assembleReport(baseInput);
  const center = r.sensitivity.find((c) => c.priceDelta === 0 && c.costDelta === 0)!;
  assert(center, "center cell exists");
  // profit and ROC of center should match base scenario within rounding
  assertAlmostEquals(center.profit, r.developerProfit, 5);
  assertAlmostEquals(center.roc, r.rocPct, 0.1);
});

Deno.test("sensitivity: higher price → higher profit, higher cost → lower profit", () => {
  const r = assembleReport(baseInput);
  const get = (pd: number, cd: number) =>
    r.sensitivity.find((c) => c.priceDelta === pd && c.costDelta === cd)!;
  assert(get(5, 0).profit > get(0, 0).profit);
  assert(get(-5, 0).profit < get(0, 0).profit);
  assert(get(0, 5).profit < get(0, 0).profit);
});

Deno.test("breakeven < current sale price for a profitable project", () => {
  const r = assembleReport(baseInput);
  if (r.developerProfit > 0) {
    assert(r.breakevenPricePerSqm < baseInput.avgSalePricePerSqm);
  }
});

Deno.test("monthly cashflow length and structure", () => {
  const r = assembleReport(baseInput);
  assertEquals(r.monthlyCashflow.length, baseInput.constructionMonths + 4); // 0..T+3
  // sum of inflows ≈ netSalesRevenue (within rounding)
  const totalIn = r.monthlyCashflow.reduce((a, b) => a + b.inflow, 0);
  assertAlmostEquals(totalIn, r.netSalesRevenue, r.netSalesRevenue * 0.01);
});

Deno.test("IRR returns finite number", () => {
  const r = assembleReport(baseInput);
  assert(Number.isFinite(r.irrPct));
});

Deno.test("deterministic: same input → exact same output", () => {
  const a = assembleReport(baseInput);
  const b = assembleReport(baseInput);
  assertEquals(a.developerProfit, b.developerProfit);
  assertEquals(a.rocPct, b.rocPct);
  assertEquals(a.irrPct, b.irrPct);
  assertEquals(a.breakevenPricePerSqm, b.breakevenPricePerSqm);
});

Deno.test("physical constraints add cost when active", () => {
  const baseR = assembleReport(baseInput);
  const withTrees = assembleReport({
    ...baseInput,
    zoning: { ...baseInput.zoning, treesForConservation: 5, requiredBasementFloors: 2, dewateringRequired: true },
  });
  assert(withTrees.physicalConstraintsCost > baseR.physicalConstraintsCost);
  assert(withTrees.totalProjectCost > baseR.totalProjectCost);
});
