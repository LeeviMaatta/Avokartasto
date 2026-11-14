import {
  TERRAIN_SWAMP,
  TERRAIN_WATER,
  type GridPoint,
  type TerrainGrid,
  type TerrainRouteOptions,
} from "./terrainTypes";
import { MinHeap } from "./minHeap";
import {
  computeGridElevationBounds,
  computeSwampCellMultipliers,
  resolveRoutingWeights,
  stepCost,
} from "./terrainCostModel";

const KNIGHT_MOVES: ReadonlyArray<readonly [number, number, ReadonlyArray<readonly [number, number]>]> = [
  [2, 1, [[1, 0], [1, 1]]],
  [2, -1, [[1, 0], [1, -1]]],
  [-2, 1, [[-1, 0], [-1, 1]]],
  [-2, -1, [[-1, 0], [-1, -1]]],
  [1, 2, [[0, 1], [1, 1]]],
  [-1, 2, [[0, 1], [-1, 1]]],
  [1, -2, [[0, -1], [1, -1]]],
  [-1, -2, [[0, -1], [-1, -1]]],
];

const CARDINAL_AND_DIAG: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Etsii 16-suuntaisella A*-haulla polun, jossa on mahdollisimman vähän nousua
 * ja joka kiertää suo- sekä vesistöesteet.
 */
export function findLowestClimbGridPath(
  grid: TerrainGrid,
  start: GridPoint,
  goal: GridPoint,
  options: TerrainRouteOptions = {},
): GridPoint[] {
  const sx = Math.max(0, Math.min(grid.width - 1, start.x));
  const sy = Math.max(0, Math.min(grid.height - 1, start.y));
  const gx = Math.max(0, Math.min(grid.width - 1, goal.x));
  const gy = Math.max(0, Math.min(grid.height - 1, goal.y));
  const startIdx = sy * grid.width + sx;
  const goalIdx = gy * grid.width + gx;
  if (startIdx === goalIdx) return [{ x: sx, y: sy }];

  const weights = resolveRoutingWeights(options);
  const swampMultipliers = computeSwampCellMultipliers(grid, weights);
  const { minGridElev, invElevRange } = computeGridElevationBounds(grid);
  const startInWater = (grid.terrainFlags[startIdx] & TERRAIN_WATER) !== 0;
  const goalInWater = (grid.terrainFlags[goalIdx] & TERRAIN_WATER) !== 0;

  const cellStepXM = grid.stepX * grid.metersPerUnit;
  const cellStepYM = grid.stepY * grid.metersPerUnit;
  const cardinalDiagDists = CARDINAL_AND_DIAG.map(([dx, dy]) =>
    Math.hypot(dx * cellStepXM, dy * cellStepYM),
  );
  const knightDists = KNIGHT_MOVES.map(([dx, dy]) =>
    Math.hypot(dx * cellStepXM, dy * cellStepYM),
  );

  const goalElev = grid.elevations[goalIdx];
  const heuristic = (cx: number, cy: number, idx: number): number => {
    const horiz = Math.hypot((cx - gx) * cellStepXM, (cy - gy) * cellStepYM);
    const dh = goalElev - grid.elevations[idx];
    return horiz + (dh > 0 ? weights.climbWeight * dh : 0);
  };

  const total = grid.width * grid.height;

  const runAStar = (waterPassMode: "strict" | "fallback"): GridPoint[] | null => {
    const gCost = new Float64Array(total);
    gCost.fill(Infinity);
    const parent = new Int32Array(total);
    parent.fill(-1);
    const closed = new Uint8Array(total);

    const waterPenaltyMultiplier = waterPassMode === "fallback" ? 1500 : 500;
    const heap = new MinHeap(Math.min(total, 1024));
    gCost[startIdx] = 0;
    heap.push(startIdx, heuristic(sx, sy, startIdx));

    const tryNeighbor = (
      curIdx: number,
      curG: number,
      nx: number,
      ny: number,
      distM: number,
      allowWaterStep: boolean,
      midElev?: number,
    ) => {
      const nIdx = ny * grid.width + nx;
      if (closed[nIdx]) return;
      const cost = stepCost(
        grid, curIdx, nIdx, distM, allowWaterStep, weights, midElev,
        minGridElev, invElevRange, waterPenaltyMultiplier, swampMultipliers,
      );
      if (!Number.isFinite(cost)) return;

      const nextG = curG + cost;
      if (nextG < gCost[nIdx]) {
        gCost[nIdx] = nextG;
        parent[nIdx] = curIdx;
        heap.push(nIdx, nextG + heuristic(nx, ny, nIdx));
      }
    };

    let reached = false;
    while (heap.size > 0) {
      const curIdx = heap.pop();
      if (closed[curIdx]) continue;
      if (curIdx === goalIdx) {
        reached = true;
        break;
      }
      closed[curIdx] = 1;

      const curX = curIdx % grid.width;
      const curY = (curIdx - curX) / grid.width;
      const curG = gCost[curIdx];
      const curInWater = (grid.terrainFlags[curIdx] & TERRAIN_WATER) !== 0;

      for (let i = 0; i < CARDINAL_AND_DIAG.length; i++) {
        const [dx, dy] = CARDINAL_AND_DIAG[i];
        const nx = curX + dx;
        const ny = curY + dy;
        if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;

        const nIdx = ny * grid.width + nx;
        const nearWetStartOrGoal =
          (startInWater && Math.max(Math.abs(nx - sx), Math.abs(ny - sy)) <= 1) ||
          (goalInWater && Math.max(Math.abs(nx - gx), Math.abs(ny - gy)) <= 1);
        const allowWaterStep =
          waterPassMode === "fallback" || curInWater || nIdx === goalIdx || nearWetStartOrGoal;

        let midElev: number | undefined;
        if (dx !== 0 && dy !== 0) {
          const c1Idx = curY * grid.width + nx;
          const c2Idx = ny * grid.width + curX;
          const cornerFlags = grid.terrainFlags[c1Idx] | grid.terrainFlags[c2Idx];
          if (
            weights.avoidWater && waterPassMode === "strict" &&
            !curInWater && !nearWetStartOrGoal && (cornerFlags & TERRAIN_WATER) !== 0
          ) {
            continue;
          }
          midElev = 0.25 * (
            grid.elevations[curIdx] + grid.elevations[nIdx] +
            grid.elevations[c1Idx] + grid.elevations[c2Idx]
          );
        }
        tryNeighbor(curIdx, curG, nx, ny, cardinalDiagDists[i], allowWaterStep, midElev);
      }

      for (let i = 0; i < KNIGHT_MOVES.length; i++) {
        const [dx, dy] = KNIGHT_MOVES[i];
        const nx = curX + dx;
        const ny = curY + dy;
        if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue;

        const nIdx = ny * grid.width + nx;
        const nearWetStartOrGoal =
          (startInWater && Math.max(Math.abs(nx - sx), Math.abs(ny - sy)) <= 1) ||
          (goalInWater && Math.max(Math.abs(nx - gx), Math.abs(ny - gy)) <= 1);
        const allowWaterStep =
          waterPassMode === "fallback" || curInWater || nIdx === goalIdx || nearWetStartOrGoal;

        const endpointMaxElev = Math.max(grid.elevations[curIdx], grid.elevations[nIdx]);
        let maxMidElev = -Infinity;
        let blockedMid = false;
        const minBoxX = Math.min(curX, nx);
        const maxBoxX = Math.max(curX, nx);
        const minBoxY = Math.min(curY, ny);
        const maxBoxY = Math.max(curY, ny);
        // Käydään läpi koko 2x3 / 3x2 ruutulaatikko, jotta ratsunhyppy ei leikkaa jyrkänteen tai veden kulmaa
        for (let my = minBoxY; my <= maxBoxY && !blockedMid; my++) {
          for (let mx = minBoxX; mx <= maxBoxX; mx++) {
            if ((mx === curX && my === curY) || (mx === nx && my === ny)) continue;
            const mIdx = my * grid.width + mx;
            const mFlags = grid.terrainFlags[mIdx];
            if (weights.avoidWater && waterPassMode === "strict" && !curInWater && (mFlags & TERRAIN_WATER) !== 0) {
              blockedMid = true;
              break;
            }
            if (weights.avoidSwamp && (mFlags & TERRAIN_SWAMP) !== 0) {
              blockedMid = true;
              break;
            }
            const mElev = grid.elevations[mIdx];
            if (mElev > endpointMaxElev + 0.5) {
              blockedMid = true;
              break;
            }
            if (mElev > maxMidElev) maxMidElev = mElev;
          }
        }
        if (!blockedMid) {
          tryNeighbor(
            curIdx, curG, nx, ny, knightDists[i], allowWaterStep,
            Number.isFinite(maxMidElev) ? maxMidElev : undefined,
          );
        }
      }
    }

    if (!reached) return null;

    const reversed: GridPoint[] = [];
    let cursor = goalIdx;
    while (cursor !== -1) {
      const x = cursor % grid.width;
      const y = (cursor - x) / grid.width;
      reversed.push({ x, y });
      if (cursor === startIdx) break;
      cursor = parent[cursor];
    }
    reversed.reverse();
    return reversed;
  };

  const strictPath = runAStar("strict");
  if (strictPath) return strictPath;

  if (weights.avoidWater) {
    const fallbackPath = runAStar("fallback");
    if (fallbackPath) return fallbackPath;
  }

  return [{ x: sx, y: sy }, { x: gx, y: gy }];
}
