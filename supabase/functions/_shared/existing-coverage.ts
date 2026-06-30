// Pure helper that resolves the "existing coverage" value and its source tag.
// Priority 1: trusted GIS footprint from the pre-analysis step (coverageReliable=true).
// Priority 2: internal calculation = builtArea ÷ floors ÷ plotArea.
// Returns null when no reliable source is available.

export type ExistingCoverageInput = {
  coverageReliable?: boolean;
  coverageExact?: number;
  buildingFootprint?: number;
  coverageStatus?: string;
  plotArea: number;
  existingBuiltAreaSqm?: number;
  existingFloors?: number;
};

export type ExistingCoverageResolution = {
  source: "gis" | "internal";
  coverageExistingPct: number;
  buildingFootprintSqm?: number;
  coverageSource: string;
  sourceLine: string;
};

const DEFAULT_GIS_LABEL = "GIS עיריית תל אביב — שכבות 524/513";
const INTERNAL_LABEL = "חישוב פנימי: שטח בנוי ÷ קומות ÷ שטח מגרש";
const INTERNAL_SOURCE_LINE =
  "תכסית קיימת — חישוב פנימי (שטח בנוי ÷ קומות ÷ שטח מגרש)";

export function resolveExistingCoverage(
  input: ExistingCoverageInput,
): ExistingCoverageResolution | null {
  // Priority 1: trusted GIS
  if (
    input.coverageReliable === true &&
    typeof input.coverageExact === "number" &&
    input.coverageExact > 0 &&
    input.coverageExact <= 100
  ) {
    const label = input.coverageStatus ?? DEFAULT_GIS_LABEL;
    const result: ExistingCoverageResolution = {
      source: "gis",
      coverageExistingPct: input.coverageExact,
      coverageSource: label,
      sourceLine: label,
    };
    if (
      typeof input.buildingFootprint === "number" &&
      input.buildingFootprint > 0
    ) {
      result.buildingFootprintSqm = input.buildingFootprint;
    }
    return result;
  }

  // Priority 2: internal calculation
  const plotArea = input.plotArea;
  const built = input.existingBuiltAreaSqm ?? 0;
  const floors = input.existingFloors ?? 0;
  if (plotArea > 0 && built > 0 && floors > 0) {
    const fp = built / floors;
    const covPct = (fp / plotArea) * 100;
    if (covPct > 0 && covPct <= 100) {
      return {
        source: "internal",
        coverageExistingPct: Math.round(covPct * 10) / 10,
        buildingFootprintSqm: Math.round(fp),
        coverageSource: INTERNAL_LABEL,
        sourceLine: INTERNAL_SOURCE_LINE,
      };
    }
  }

  return null;
}
