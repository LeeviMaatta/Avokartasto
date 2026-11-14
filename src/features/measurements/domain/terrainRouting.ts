import {
  TERRAIN_NONE,
  TERRAIN_SWAMP,
  TERRAIN_SWAMP_WET,
  TERRAIN_WATER,
  type TerrainGrid,
  type TerrainRouteOptions,
  type TerrainRoutePreset,
  type TerrainRouteStats,
} from "./terrain/terrainTypes";
import {
  gridCellToMercator,
  mercatorToGridCell,
  resolveRoutingWeights,
  sampleElevationBilinear,
} from "./terrain/terrainCostModel";
import { findLowestClimbGridPath } from "./terrain/astarGridPathfinder";
import { segmentTouchesWaterOnGrid } from "./terrain/chordCost";
import { smoothGridPath } from "./terrain/pathSmoother";

export {
  TERRAIN_NONE,
  TERRAIN_SWAMP,
  TERRAIN_SWAMP_WET,
  TERRAIN_WATER,
  findLowestClimbGridPath,
  gridCellToMercator,
  mercatorToGridCell,
  resolveRoutingWeights,
  sampleElevationBilinear,
  smoothGridPath,
  type TerrainGrid,
  type TerrainRouteOptions,
  type TerrainRoutePreset,
  type TerrainRouteStats,
};

export function measureMercatorPolylineStats(
  grid: TerrainGrid,
  coordsMercator: [number, number][],
): { lengthM: number; climbM: number } {
  if (coordsMercator.length < 2) return { lengthM: 0, climbM: 0 };
  let lengthM = 0;
  let climbM = 0;
  const sampleStepM = Math.max(10, Math.min(grid.stepX, grid.stepY) * grid.metersPerUnit * 0.5);
  let prevElev = sampleElevationBilinear(grid, coordsMercator[0][0], coordsMercator[0][1]);

  for (let i = 1; i < coordsMercator.length; i++) {
    const [x0, y0] = coordsMercator[i - 1];
    const [x1, y1] = coordsMercator[i];
    const segM = Math.hypot(x1 - x0, y1 - y0) * grid.metersPerUnit;
    lengthM += segM;
    const samples = Math.max(1, Math.ceil(segM / sampleStepM));
    for (let s = 1; s <= samples; s++) {
      const t = s / samples;
      const elev = sampleElevationBilinear(grid, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      if (elev > prevElev) climbM += elev - prevElev;
      prevElev = elev;
    }
  }
  return { lengthM, climbM };
}

/**
 * Reitittää EPSG:3857-koordinaateissa annetut välietapit maastohilalla ja
 * palauttaa optimoidun reitin Mercator-koordinaatit sekä nousu-/pituusvertailun.
 */
export function routeMercatorWaypointsOnGrid(
  grid: TerrainGrid,
  waypointsMercator: [number, number][],
  options: TerrainRouteOptions = {},
): {
  coordinatesMercator: [number, number][];
  stats: TerrainRouteStats;
} {
  if (waypointsMercator.length < 2) {
    return {
      coordinatesMercator: waypointsMercator,
      stats: { originalLengthM: 0, routedLengthM: 0, originalClimbM: 0, routedClimbM: 0 },
    };
  }

  const avoidWater = options.avoidWater ?? true;
  const original = measureMercatorPolylineStats(grid, waypointsMercator);
  const fullPath: [number, number][] = [waypointsMercator[0]];

  for (let i = 0; i < waypointsMercator.length - 1; i++) {
    const startPt = waypointsMercator[i];
    const endPt = waypointsMercator[i + 1];
    const startCell = mercatorToGridCell(grid, startPt[0], startPt[1]);
    const endCell = mercatorToGridCell(grid, endPt[0], endPt[1]);
    const rawGridPath = findLowestClimbGridPath(grid, startCell, endCell, options);
    const smoothed = smoothGridPath(grid, rawGridPath, options);

    if (avoidWater && smoothed.length >= 2 && (grid.terrainFlags[startCell.y * grid.width + startCell.x] & TERRAIN_WATER) === 0) {
      const sx = (startPt[0] - grid.minX) / grid.stepX;
      const sy = (startPt[1] - grid.minY) / grid.stepY;
      if (segmentTouchesWaterOnGrid(grid, sx, sy, smoothed[1].x, smoothed[1].y)) {
        fullPath.push(gridCellToMercator(grid, smoothed[0]));
      }
    }
    for (let j = 1; j < smoothed.length - 1; j++) {
      fullPath.push(gridCellToMercator(grid, smoothed[j]));
    }
    if (avoidWater && smoothed.length >= 2 && (grid.terrainFlags[endCell.y * grid.width + endCell.x] & TERRAIN_WATER) === 0) {
      const ex = (endPt[0] - grid.minX) / grid.stepX;
      const ey = (endPt[1] - grid.minY) / grid.stepY;
      const prev = smoothed[smoothed.length - 2];
      if (segmentTouchesWaterOnGrid(grid, prev.x, prev.y, ex, ey)) {
        fullPath.push(gridCellToMercator(grid, smoothed[smoothed.length - 1]));
      }
    }
    fullPath.push(endPt);
  }

  const routed = measureMercatorPolylineStats(grid, fullPath);
  return {
    coordinatesMercator: fullPath,
    stats: {
      originalLengthM: original.lengthM,
      routedLengthM: routed.lengthM,
      originalClimbM: original.climbM,
      routedClimbM: routed.climbM,
    },
  };
}
