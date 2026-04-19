export interface Plot {
  q: 3 | 4;
  gush: number;
  helka: number;
  area: number | null;
  shapeArea: number | null;
}

export interface RedFlag {
  level: "critical" | "warning" | "info";
  title: string;
  description: string;
  source: string;
}

export interface FeasibilityReport {
  status: "high_potential" | "medium_potential" | "high_risk" | "blocked";
  statusLabel: string;
  headline: string;
  existing: {
    units: number;
    floors: number;
    builtAreaSqm: number;
    far: number;
  };
  proposed: {
    units: number;
    floors: number;
    builtAreaSqm: number;
    far: number;
    heightMeters: number;
  };
  metrics: {
    multiplier: number;
    newUnits: number;
    estimatedSellableArea: number;
    avgUnitSize: number;
  };
  zoning: {
    maxHeightMeters: number;
    maxFloors: number;
    frontSetbackM: number;
    sideSetbackM: number;
    rearSetbackM: number;
    maxFAR: number;
    source: string;
  };
  redFlags: RedFlag[];
  committeeSummary: string;
  sources: string[];
}

export interface AnalysisInput {
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
