// Deno tests for the existing-coverage resolver.
// Run: deno test supabase/functions/_shared/existing-coverage.test.ts

import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveExistingCoverage } from "./existing-coverage.ts";

Deno.test("GIS priority — reliable + valid coverageExact wins", () => {
  const result = resolveExistingCoverage({
    coverageReliable: true,
    coverageExact: 42.5,
    buildingFootprint: 212,
    plotArea: 500,
    existingBuiltAreaSqm: 800,
    existingFloors: 3,
  });
  assertEquals(result?.source, "gis");
  assertEquals(result?.coverageExistingPct, 42.5);
  assertEquals(result?.buildingFootprintSqm, 212);
  assertEquals(result?.coverageSource, "GIS עיריית תל אביב — שכבות 524/513");
});

Deno.test("GIS — custom coverageStatus is used as source label", () => {
  const result = resolveExistingCoverage({
    coverageReliable: true,
    coverageExact: 35,
    coverageStatus: "GIS — שכבה מותאמת אישית",
    plotArea: 500,
  });
  assertEquals(result?.source, "gis");
  assertEquals(result?.coverageSource, "GIS — שכבה מותאמת אישית");
  assertEquals(result?.sourceLine, "GIS — שכבה מותאמת אישית");
});

Deno.test("GIS rejected when coverageReliable=false — falls back to internal", () => {
  const result = resolveExistingCoverage({
    coverageReliable: false,
    coverageExact: 80,
    plotArea: 500,
    existingBuiltAreaSqm: 600,
    existingFloors: 3,
  });
  assertEquals(result?.source, "internal");
  // 600 / 3 = 200 ; 200 / 500 = 40%
  assertEquals(result?.coverageExistingPct, 40);
  assertEquals(result?.buildingFootprintSqm, 200);
});

Deno.test("GIS rejected when coverageExact missing — falls back to internal", () => {
  const result = resolveExistingCoverage({
    coverageReliable: true,
    plotArea: 1000,
    existingBuiltAreaSqm: 900,
    existingFloors: 3,
  });
  assertEquals(result?.source, "internal");
  assertEquals(result?.coverageExistingPct, 30);
  assertEquals(result?.buildingFootprintSqm, 300);
});

Deno.test("GIS rejected when coverageExact > 100 — falls back to internal", () => {
  const result = resolveExistingCoverage({
    coverageReliable: true,
    coverageExact: 130,
    plotArea: 500,
    existingBuiltAreaSqm: 600,
    existingFloors: 3,
  });
  assertEquals(result?.source, "internal");
});

Deno.test("Internal — rounds to one decimal", () => {
  const result = resolveExistingCoverage({
    plotArea: 777,
    existingBuiltAreaSqm: 850,
    existingFloors: 3,
  });
  // 850/3 = 283.333... ; /777 *100 = 36.4615... → 36.5
  assertEquals(result?.source, "internal");
  assertEquals(result?.coverageExistingPct, 36.5);
  assertEquals(result?.buildingFootprintSqm, 283);
  assertEquals(
    result?.coverageSource,
    "חישוב פנימי: שטח בנוי ÷ קומות ÷ שטח מגרש",
  );
});

Deno.test("Internal — returns null when builtArea missing", () => {
  const result = resolveExistingCoverage({
    plotArea: 500,
    existingFloors: 3,
  });
  assertStrictEquals(result, null);
});

Deno.test("Internal — returns null when floors missing", () => {
  const result = resolveExistingCoverage({
    plotArea: 500,
    existingBuiltAreaSqm: 600,
  });
  assertStrictEquals(result, null);
});

Deno.test("Internal — returns null when plotArea is zero", () => {
  const result = resolveExistingCoverage({
    plotArea: 0,
    existingBuiltAreaSqm: 600,
    existingFloors: 3,
  });
  assertStrictEquals(result, null);
});

Deno.test("Internal — returns null when calculated coverage > 100% (data anomaly)", () => {
  const result = resolveExistingCoverage({
    plotArea: 100,
    existingBuiltAreaSqm: 600,
    existingFloors: 3,
  });
  // 600/3=200 ; 200/100=200% → invalid
  assertStrictEquals(result, null);
});

Deno.test("All inputs empty — returns null", () => {
  const result = resolveExistingCoverage({ plotArea: 500 });
  assertStrictEquals(result, null);
});

Deno.test("GIS without buildingFootprint — omits the field", () => {
  const result = resolveExistingCoverage({
    coverageReliable: true,
    coverageExact: 25,
    plotArea: 500,
  });
  assertEquals(result?.source, "gis");
  assertEquals(result?.buildingFootprintSqm, undefined);
});
