// UNESCO "White City" core + buffer zone polygon (Tel Aviv).
// Coordinates are in ITM (EPSG:2039) — same CRS as GovMap centroids
// returned by fetch-plot-geometry. The polygon is a manually digitized
// approximation of the buffer zone declared in 2003, bounded roughly by:
//   N: Yarkon river        S: Allenby / Sderot Yerushalayim
//   E: Ibn Gvirol / Begin   W: HaYarkon street / sea
// It is intentionally generous; precision is delegated to the
// Tel Aviv open-data "buildings for preservation" dataset.

export type ItmPoint = [number, number]; // [x, y]

export const UNESCO_BUFFER_ITM: ItmPoint[] = [
  // West edge (HaYarkon st.) — north to south
  [178250, 666400],
  [178300, 665400],
  [178400, 664600],
  [178500, 663900],
  [178650, 663400],
  // South edge (Allenby → Begin)
  [179100, 663250],
  [179700, 663180],
  [180200, 663220],
  [180600, 663350],
  // East edge (Ibn Gvirol → Begin)
  [180800, 663800],
  [180850, 664400],
  [180800, 665100],
  [180700, 665800],
  [180550, 666300],
  // North edge (Yarkon)
  [180000, 666500],
  [179400, 666550],
  [178800, 666500],
  [178400, 666450],
  [178250, 666400], // close
];

/**
 * Ray-casting point-in-polygon. Coordinates assumed in the same CRS.
 * Returns true if the point lies inside the polygon.
 */
export function pointInPolygon(point: ItmPoint, polygon: ItmPoint[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
