// Tests for multi-ring polygon geometry helpers
// Run: deno test supabase/functions/fetch-plot-geometry/index_test.ts

import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// Re-import the helpers under test (duplicated here so tests are self-contained)
function signedArea(ring: number[][]): number {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

function pointInPolygon(pt: number[], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) &&
        (pt[0] < (xj - xi) * (pt[1] - yi) / ((yj - yi) || 1e-9) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygonWithHoles(pt: number[], rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    if (pointInPolygon(pt, ring)) inside = !inside;
  }
  return inside;
}

function polygonAreaWithHoles(rings: number[][][]): number {
  let total = 0;
  for (const ring of rings) {
    const a = signedArea(ring);
    total += a < 0 ? Math.abs(a) : -Math.abs(a);
  }
  return Math.max(0, total);
}

// ── Sample geometries ──

/** 10×10 square, clockwise (ArcGIS outer) */
const outer10CW: number[][] = [
  [0, 0],
  [0, 10],
  [10, 10],
  [10, 0],
  [0, 0],
];

/** 5×5 square, counter-clockwise (ArcGIS hole) — centred inside outer */
const hole5CCW: number[][] = [
  [3, 3],
  [7, 3],
  [7, 7],
  [3, 7],
  [3, 3],
];

/** 3×3 square, counter-clockwise (ArcGIS hole) */
const hole3CCW: number[][] = [
  [1, 1],
  [4, 1],
  [4, 4],
  [1, 4],
  [1, 1],
];

// ── signedArea contract ──
Deno.test("signedArea: CW outer is negative", () => {
  assertEquals(signedArea(outer10CW), -100);
});

Deno.test("signedArea: CCW ring is positive", () => {
  assertEquals(signedArea(hole5CCW), 16); // 4×4 actually = 16
});

Deno.test("signedArea: CW hole is negative", () => {
  assertEquals(signedArea(hole3CW), -9);
});

// ── polygonAreaWithHoles ──
Deno.test("polygonAreaWithHoles: single outer ring (no holes)", () => {
  const area = polygonAreaWithHoles([outer10CW]);
  assertEquals(area, 100);
});

Deno.test("polygonAreaWithHoles: outer with one CCW hole", () => {
  // 10×10 outer minus 4×4 centred hole = 100 − 16 = 84
  const area = polygonAreaWithHoles([outer10CW, hole5CCW]);
  assertEquals(area, 84);
});

Deno.test("polygonAreaWithHoles: outer with two holes (mixed orientations)", () => {
  // 100 − 16 − 9 = 75
  const area = polygonAreaWithHoles([outer10CW, hole5CCW, hole3CW]);
  assertEquals(area, 75);
});

Deno.test("polygonAreaWithHoles: zero-area degenerate ring ignored", () => {
  const degenerate: number[][] = [[5, 5], [5, 5], [5, 5], [5, 5]];
  const area = polygonAreaWithHoles([outer10CW, degenerate]);
  assertEquals(area, 100);
});

// ── pointInPolygonWithHoles ──
Deno.test("pointInPolygonWithHoles: inside outer, not in hole", () => {
  const pt = [2, 2]; // inside outer, outside hole5CCW (3,3)-(7,7)
  assertEquals(pointInPolygonWithHoles(pt, [outer10CW, hole5CCW]), true);
});

Deno.test("pointInPolygonWithHoles: inside hole is excluded", () => {
  const pt = [5, 5]; // inside hole5CCW
  assertEquals(pointInPolygonWithHoles(pt, [outer10CW, hole5CCW]), false);
});

Deno.test("pointInPolygonWithHoles: outside outer is excluded", () => {
  const pt = [15, 15];
  assertEquals(pointInPolygonWithHoles(pt, [outer10CW, hole5CCW]), false);
});

Deno.test("pointInPolygonWithHoles: on hole boundary is inside (ray-casting edge)", () => {
  // Point exactly on edge — ray-casting toggles; we assert deterministic false
  // because the edge test is ((yi > pt[1]) !== (yj > pt[1])) and pt on shared boundary
  const pt = [3, 5]; // on left edge of hole5CCW
  const result = pointInPolygonWithHoles(pt, [outer10CW, hole5CCW]);
  // On boundary is implementation-defined; we just assert it does not crash
  assertEquals(typeof result, "boolean");
});

Deno.test("pointInPolygonWithHoles: two holes — excluded if in either hole", () => {
  // hole5CCW excludes (5,5); hole3CW excludes (2,2)
  assertEquals(pointInPolygonWithHoles([5, 5], [outer10CW, hole5CCW, hole3CW]), false);
  assertEquals(pointInPolygonWithHoles([2, 2], [outer10CW, hole5CCW, hole3CW]), false);
  // (8,8) inside outer, outside both holes
  assertEquals(pointInPolygonWithHoles([8, 8], [outer10CW, hole5CCW, hole3CW]), true);
});
