import {
  TERRAIN_SWAMP,
  TERRAIN_SWAMP_WET,
  TERRAIN_WATER,
  type GridPoint,
  type TerrainGrid,
  type TerrainRouteOptions,
  type TerrainRoutePreset,
} from "./terrainTypes";

export interface ResolvedRoutingWeights {
  preset: TerrainRoutePreset;
  avoidSwamp: boolean;
  avoidWater: boolean;
  climbWeight: number;
  slopePenalty: number;
  swampMultiplier: number;
  wetSwampMultiplier: number;
  allowNarrowSwampCrossing: boolean;
  altitudeWeight: number;
}

export function resolveRoutingWeights(options: TerrainRouteOptions = {}): ResolvedRoutingWeights {
  const preset = options.preset ?? "min-climb";
  const defaultClimbWeight = preset === "balanced" ? 10 : 30;
  const defaultSlopePenalty = preset === "balanced" ? 40 : 120;
  return {
    preset,
    avoidSwamp: options.avoidSwamp ?? true,
    avoidWater: options.avoidWater ?? true,
    climbWeight: options.climbWeight ?? defaultClimbWeight,
    slopePenalty: options.slopePenalty ?? defaultSlopePenalty,
    swampMultiplier: options.swampMultiplier ?? (preset === "balanced" ? 25 : 40),
    wetSwampMultiplier: options.swampMultiplier ?? (preset === "balanced" ? 60 : 80),
    allowNarrowSwampCrossing: preset === "balanced" && options.swampMultiplier === undefined,
    altitudeWeight: preset === "balanced" ? 0.6 : 1.5,
  };
}

const CROSSING_AXES: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export function computeSwampCellMultipliers(
  grid: TerrainGrid,
  weights: ResolvedRoutingWeights,
): Float32Array | null {
  if (!weights.avoidSwamp) return null;

  const total = grid.width * grid.height;
  const mults = new Float32Array(total);
  const cellStepM = Math.min(grid.stepX, grid.stepY) * grid.metersPerUnit;
  const maxNarrowSpanCells = Math.max(3, Math.min(6, Math.round(80 / Math.max(1, cellStepM))));

  const hasAdjacentWater = (cx: number, cy: number): boolean => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;
        if ((grid.terrainFlags[ny * grid.width + nx] & TERRAIN_WATER) !== 0) return true;
      }
    }
    return false;
  };

  const measureHalfAxisDryDist = (cx: number, cy: number, dx: number, dy: number): number => {
    for (let step = 1; step <= maxNarrowSpanCells; step++) {
      const nx = cx + dx * step;
      const ny = cy + dy * step;
      if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) return Infinity;
      const flags = grid.terrainFlags[ny * grid.width + nx];
      if ((flags & (TERRAIN_WATER | TERRAIN_SWAMP_WET)) !== 0) return Infinity;
      if ((flags & TERRAIN_SWAMP) === 0) return step;
    }
    return Infinity;
  };

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const idx = y * grid.width + x;
      const flags = grid.terrainFlags[idx];
      if ((flags & TERRAIN_SWAMP) === 0) continue;

      if ((flags & TERRAIN_SWAMP_WET) !== 0 || (weights.avoidWater && hasAdjacentWater(x, y))) {
        mults[idx] = weights.wetSwampMultiplier;
        continue;
      }

      if (!weights.allowNarrowSwampCrossing) {
        mults[idx] = weights.swampMultiplier;
        continue;
      }

      let minSpan = Infinity;
      for (let a = 0; a < CROSSING_AXES.length; a++) {
        const [dx, dy] = CROSSING_AXES[a];
        const px1 = x - dy;
        const py1 = y + dx;
        const px2 = x + dy;
        const py2 = y - dx;
        const perp1IsSwamp =
          px1 >= 0 && px1 < grid.width && py1 >= 0 && py1 < grid.height &&
          (grid.terrainFlags[py1 * grid.width + px1] & TERRAIN_SWAMP) !== 0;
        const perp2IsSwamp =
          px2 >= 0 && px2 < grid.width && py2 >= 0 && py2 < grid.height &&
          (grid.terrainFlags[py2 * grid.width + px2] & TERRAIN_SWAMP) !== 0;
        if (!perp1IsSwamp && !perp2IsSwamp) continue;

        const fwd = measureHalfAxisDryDist(x, y, dx, dy);
        if (!Number.isFinite(fwd)) continue;
        const bwd = measureHalfAxisDryDist(x, y, -dx, -dy);
        if (!Number.isFinite(bwd)) continue;
        const span = fwd + bwd - 1;
        if (span < minSpan) minSpan = span;
      }

      if (!Number.isFinite(minSpan) || minSpan > maxNarrowSpanCells) {
        mults[idx] = weights.swampMultiplier;
      } else if (minSpan <= 1) {
        mults[idx] = 2.5;
      } else if (minSpan === 2) {
        mults[idx] = 3.2;
      } else if (minSpan === 3) {
        mults[idx] = 4.2;
      } else if (minSpan === 4) {
        mults[idx] = 5.5;
      } else {
        mults[idx] = 7.5;
      }
    }
  }

  return mults;
}

export function computeGridElevationBounds(grid: TerrainGrid): {
  minGridElev: number;
  invElevRange: number;
} {
  let minE = Infinity;
  let maxE = -Infinity;
  const elevs = grid.elevations;
  for (let i = 0; i < elevs.length; i++) {
    const e = elevs[i];
    if (e < minE) minE = e;
    if (e > maxE) maxE = e;
  }
  if (!Number.isFinite(minE) || !Number.isFinite(maxE)) {
    return { minGridElev: 0, invElevRange: 0 };
  }
  const range = maxE - minE;
  return {
    minGridElev: minE,
    invElevRange: range > 1 ? 1 / range : 0,
  };
}

export function mercatorToGridCell(grid: TerrainGrid, x: number, y: number): GridPoint {
  const gx = Math.round((x - grid.minX) / grid.stepX);
  const gy = Math.round((y - grid.minY) / grid.stepY);
  return {
    x: Math.max(0, Math.min(grid.width - 1, gx)),
    y: Math.max(0, Math.min(grid.height - 1, gy)),
  };
}

export function gridCellToMercator(grid: TerrainGrid, cell: GridPoint): [number, number] {
  return [grid.minX + cell.x * grid.stepX, grid.minY + cell.y * grid.stepY];
}

export function cellDistanceM(grid: TerrainGrid, ax: number, ay: number, bx: number, by: number): number {
  const dxM = (bx - ax) * grid.stepX * grid.metersPerUnit;
  const dyM = (by - ay) * grid.stepY * grid.metersPerUnit;
  return Math.hypot(dxM, dyM);
}

export function sampleElevationBilinear(grid: TerrainGrid, x: number, y: number): number {
  const fx = Math.max(0, Math.min(grid.width - 1, (x - grid.minX) / grid.stepX));
  const fy = Math.max(0, Math.min(grid.height - 1, (y - grid.minY) / grid.stepY));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(grid.width - 1, x0 + 1);
  const y1 = Math.min(grid.height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const e00 = grid.elevations[y0 * grid.width + x0];
  const e10 = grid.elevations[y0 * grid.width + x1];
  const e01 = grid.elevations[y1 * grid.width + x0];
  const e11 = grid.elevations[y1 * grid.width + x1];

  const top = e00 + (e10 - e00) * tx;
  const bot = e01 + (e11 - e01) * tx;
  return top + (bot - top) * ty;
}

export function stepCost(
  grid: TerrainGrid,
  fromIdx: number,
  toIdx: number,
  distM: number,
  allowWaterStep: boolean,
  weights: ResolvedRoutingWeights,
  midElev?: number,
  minGridElev = 0,
  invElevRange = 0,
  waterPenaltyMultiplier = 500,
  swampMultipliers: Float32Array | null = null,
): number {
  const toFlags = grid.terrainFlags[toIdx];
  const isWater = (toFlags & TERRAIN_WATER) !== 0;
  if (weights.avoidWater && isWater) {
    if (!allowWaterStep) return Infinity;
    // Jos vesistö on väistämätön (märkä lähtö/maali tai täysin poikki kulkeva vesistö), ylitys on erittäin kallis
    return distM * waterPenaltyMultiplier;
  }

  let terrainMultiplier = 1;
  if (weights.avoidSwamp && (toFlags & TERRAIN_SWAMP) !== 0) {
    terrainMultiplier = swampMultipliers ? swampMultipliers[toIdx] : weights.swampMultiplier;
  }

  const elevA = grid.elevations[fromIdx];
  const elevB = grid.elevations[toIdx];
  let climb = 0;
  let slopeTerm = 0;
  if (midElev !== undefined) {
    const c1 = midElev > elevA ? midElev - elevA : 0;
    const c2 = elevB > midElev ? elevB - midElev : 0;
    climb = c1 + c2;
    const halfDist = distM * 0.5;
    if (halfDist > 0) {
      slopeTerm = weights.slopePenalty * ((c1 * c1 + c2 * c2) / halfDist);
    }
  } else {
    const dh = elevB - elevA;
    climb = dh > 0 ? dh : 0;
    slopeTerm = climb > 0 && distM > 0 ? weights.slopePenalty * ((climb * climb) / distM) : 0;
  }

  const descent = elevA > elevB ? elevA - elevB : 0;
  const descentSlopeTerm =
    descent > 0 && distM > 0 ? weights.slopePenalty * 0.15 * ((descent * descent) / distM) : 0;
  const relAlt = invElevRange > 0 ? Math.max(0, (elevB - minGridElev) * invElevRange) : 0;

  return (
    distM * (terrainMultiplier + weights.altitudeWeight * relAlt) +
    weights.climbWeight * climb +
    slopeTerm +
    descentSlopeTerm
  );
}
