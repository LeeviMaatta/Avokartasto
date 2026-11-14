import {
  TERRAIN_SWAMP,
  TERRAIN_SWAMP_WET,
  TERRAIN_WATER,
  type GridPoint,
  type TerrainGrid,
  type TerrainRouteOptions,
} from "./terrainTypes";
import {
  computeGridElevationBounds,
  computeSwampCellMultipliers,
  resolveRoutingWeights,
  type ResolvedRoutingWeights,
} from "./terrainCostModel";
import { chordCostOnGrid } from "./chordCost";

function pointToSegmentDistCells(p: GridPoint, a: GridPoint, b: GridPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function buildPrefixTables(
  grid: TerrainGrid,
  pts: GridPoint[],
  weights: ResolvedRoutingWeights,
  minGridElev: number,
  invElevRange: number,
  swampMultipliers: Float32Array | null,
) {
  const n = pts.length;
  const prefixCost = new Float64Array(n);
  const prefixSwamp = new Int32Array(n);
  const prefixWetSwamp = new Int32Array(n);
  const firstFlags = grid.terrainFlags[pts[0].y * grid.width + pts[0].x];
  prefixSwamp[0] = (firstFlags & TERRAIN_SWAMP) !== 0 ? 1 : 0;
  prefixWetSwamp[0] = (firstFlags & TERRAIN_SWAMP_WET) !== 0 ? 1 : 0;

  for (let i = 1; i < n; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const bFlags = grid.terrainFlags[b.y * grid.width + b.x];
    const allowWater =
      weights.avoidWater &&
      (((grid.terrainFlags[a.y * grid.width + a.x] | bFlags) & TERRAIN_WATER) !== 0);
    prefixCost[i] =
      prefixCost[i - 1] +
      chordCostOnGrid(
        grid, a, b, allowWater, true, true, weights,
        minGridElev, invElevRange, true, swampMultipliers,
      );
    prefixSwamp[i] = prefixSwamp[i - 1] + ((bFlags & TERRAIN_SWAMP) !== 0 ? 1 : 0);
    prefixWetSwamp[i] = prefixWetSwamp[i - 1] + ((bFlags & TERRAIN_SWAMP_WET) !== 0 ? 1 : 0);
  }

  return { prefixCost, prefixSwamp, prefixWetSwamp };
}

function pruneRedundantVertices(
  grid: TerrainGrid,
  pts: GridPoint[],
  weights: ResolvedRoutingWeights,
  minGridElev: number,
  invElevRange: number,
  swampMultipliers: Float32Array | null = null,
): GridPoint[] {
  if (pts.length <= 2) return pts;
  const { prefixCost: segCost, prefixSwamp: swampPrefix, prefixWetSwamp: wetSwampPrefix } =
    buildPrefixTables(grid, pts, weights, minGridElev, invElevRange, swampMultipliers);

  const out: GridPoint[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let bestJ = i + 1;
    const iFlags = grid.terrainFlags[pts[i].y * grid.width + pts[i].x];
    const iInSwamp = (iFlags & TERRAIN_SWAMP) !== 0;
    const iInWetSwamp = (iFlags & TERRAIN_SWAMP_WET) !== 0;

    for (let j = pts.length - 1; j >= i + 2; j--) {
      let maxDev = 0;
      for (let k = i + 1; k < j; k++) {
        const d = pointToSegmentDistCells(pts[k], pts[i], pts[j]);
        if (d > maxDev) maxDev = d;
        if (maxDev > 1.15) break;
      }
      if (maxDev > 1.15) continue;

      const allowSwamp = iInSwamp || swampPrefix[j] - swampPrefix[i] > 0;
      const allowWetSwamp = iInWetSwamp || wetSwampPrefix[j] - wetSwampPrefix[i] > 0;
      const shortcutCost = chordCostOnGrid(
        grid, pts[i], pts[j], false, allowSwamp, false, weights,
        minGridElev, invElevRange, allowWetSwamp, swampMultipliers,
      );
      if (!Number.isFinite(shortcutCost)) continue;
      const subCost = segCost[j] - segCost[i];
      if (shortcutCost <= subCost * 1.035 + 4) {
        bestJ = j;
        break;
      }
    }

    out.push(pts[bestJ]);
    i = bestJ;
  }
  return out;
}

/**
 * Oikoo ruudukkoportaikot lyhyimmäksi kelvolliseksi reitiksi DP-optimoinnilla siten,
 * ettei oikaisu leikkaa suo-/vesistöesteitä eikä kasvata nousukustannusta.
 */
export function smoothGridPath(
  grid: TerrainGrid,
  path: GridPoint[],
  options: TerrainRouteOptions = {},
): GridPoint[] {
  if (path.length <= 2) return path;
  const weights = resolveRoutingWeights(options);
  const swampMultipliers = computeSwampCellMultipliers(grid, weights);
  const { minGridElev, invElevRange } = computeGridElevationBounds(grid);
  const n = path.length;

  const { prefixCost, prefixSwamp, prefixWetSwamp } =
    buildPrefixTables(grid, path, weights, minGridElev, invElevRange, swampMultipliers);

  const dpCost = new Float64Array(n);
  dpCost.fill(Infinity);
  const dpPrev = new Int32Array(n);
  dpPrev.fill(-1);
  dpCost[0] = 0;

  const vertexPenalty = 6;
  for (let i = 0; i < n - 1; i++) {
    if (!Number.isFinite(dpCost[i])) continue;

    // Pidetään alkuperäinen yksittäinen askel aina sallittuna siirtymänä
    const stepSegCost = prefixCost[i + 1] - prefixCost[i];
    const nextStepTotal = dpCost[i] + stepSegCost + vertexPenalty;
    if (nextStepTotal < dpCost[i + 1]) {
      dpCost[i + 1] = nextStepTotal;
      dpPrev[i + 1] = i;
    }

    const iFlags = grid.terrainFlags[path[i].y * grid.width + path[i].x];
    const iInSwamp = (iFlags & TERRAIN_SWAMP) !== 0;
    const iInWetSwamp = (iFlags & TERRAIN_SWAMP_WET) !== 0;
    const maxCand = Math.min(n - 1, i + 160);
    for (let cand = i + 2; cand <= maxCand; cand++) {
      const allowSwamp = iInSwamp || prefixSwamp[cand] - prefixSwamp[i] > 0;
      const allowWetSwamp = iInWetSwamp || prefixWetSwamp[cand] - prefixWetSwamp[i] > 0;
      const shortcutCost = chordCostOnGrid(
        grid, path[i], path[cand], false, allowSwamp, false, weights,
        minGridElev, invElevRange, allowWetSwamp, swampMultipliers,
      );
      if (!Number.isFinite(shortcutCost)) continue;
      const origCost = prefixCost[cand] - prefixCost[i];
      if (shortcutCost <= origCost * 1.025 + 3.0) {
        const candTotal = dpCost[i] + Math.min(shortcutCost, origCost) + vertexPenalty;
        if (candTotal < dpCost[cand]) {
          dpCost[cand] = candTotal;
          dpPrev[cand] = i;
        }
      }
    }
  }

  const smoothedRev: GridPoint[] = [];
  let cursor = n - 1;
  while (cursor !== -1) {
    smoothedRev.push(path[cursor]);
    if (cursor === 0) break;
    cursor = dpPrev[cursor];
  }
  if (smoothedRev[smoothedRev.length - 1] !== path[0]) {
    return path;
  }
  smoothedRev.reverse();
  return pruneRedundantVertices(grid, smoothedRev, weights, minGridElev, invElevRange, swampMultipliers);
}
