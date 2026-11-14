export const TERRAIN_NONE = 0;
export const TERRAIN_SWAMP = 1 << 0;
export const TERRAIN_WATER = 1 << 1;
export const TERRAIN_SWAMP_WET = 1 << 2;

export type TerrainRoutePreset = "min-climb" | "balanced";

export interface TerrainGrid {
  width: number;
  height: number;
  /** Ruudukon länsireuna EPSG:3857-koordinaatistossa */
  minX: number;
  /** Ruudukon eteläreuna EPSG:3857-koordinaatistossa */
  minY: number;
  /** Yhden solun leveys EPSG:3857-yksiköissä */
  stepX: number;
  /** Yhden solun korkeus EPSG:3857-yksiköissä */
  stepY: number;
  /** Yhden EPSG:3857-yksikön todellinen maastopituus metreinä (cos(lat)) */
  metersPerUnit: number;
  /** Korkeudet metreinä (pituus width * height, rivi-järjestyksessä y=0..height-1) */
  elevations: Float32Array;
  /** Maastoluokat bittimaskina (TERRAIN_SWAMP | TERRAIN_WATER) */
  terrainFlags: Uint8Array;
}

export interface TerrainRouteOptions {
  preset?: TerrainRoutePreset;
  avoidSwamp?: boolean;
  avoidWater?: boolean;
  /** Huomioidaanko kapeat purot ja ojat (waterway=stream) vesistökierrossa */
  avoidStreams?: boolean;
  /** Nousumetrin painoarvo suhteessa vaakametriin (oletus johdetaan presetistä) */
  climbWeight?: number;
  /** Jyrkkyysneliön lisäsakko (rankaisee jyrkkiä nousuja loivaa enemmän) */
  slopePenalty?: number;
  /** Suoalueen kulkukustannuskerroin (oletus 40x) */
  swampMultiplier?: number;
}

export interface TerrainRouteStats {
  originalLengthM: number;
  routedLengthM: number;
  originalClimbM: number;
  routedClimbM: number;
}

export interface TerrainRouteResult {
  /** Reitin koordinaatit muodossa [lon, lat][] (WGS84 / EPSG:4326) */
  coordinates: [number, number][];
  stats: TerrainRouteStats;
}

interface GridPoint {
  x: number;
  y: number;
}

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

class MinHeap {
  private indices: Int32Array;
  private priorities: Float64Array;
  public size = 0;

  constructor(capacity: number) {
    this.indices = new Int32Array(Math.max(16, capacity));
    this.priorities = new Float64Array(Math.max(16, capacity));
  }

  push(index: number, priority: number): void {
    if (this.size >= this.indices.length) {
      const nextCap = this.indices.length * 2;
      const nextIdx = new Int32Array(nextCap);
      const nextPri = new Float64Array(nextCap);
      nextIdx.set(this.indices);
      nextPri.set(this.priorities);
      this.indices = nextIdx;
      this.priorities = nextPri;
    }
    let pos = this.size++;
    while (pos > 0) {
      const parent = (pos - 1) >> 1;
      if (this.priorities[parent] <= priority) break;
      this.indices[pos] = this.indices[parent];
      this.priorities[pos] = this.priorities[parent];
      pos = parent;
    }
    this.indices[pos] = index;
    this.priorities[pos] = priority;
  }

  pop(): number {
    const top = this.indices[0];
    const lastIdx = --this.size;
    if (lastIdx > 0) {
      const movedIndex = this.indices[lastIdx];
      const movedPri = this.priorities[lastIdx];
      let pos = 0;
      const half = lastIdx >> 1;
      while (pos < half) {
        let child = (pos << 1) + 1;
        const right = child + 1;
        if (right < lastIdx && this.priorities[right] < this.priorities[child]) {
          child = right;
        }
        if (movedPri <= this.priorities[child]) break;
        this.indices[pos] = this.indices[child];
        this.priorities[pos] = this.priorities[child];
        pos = child;
      }
      this.indices[pos] = movedIndex;
      this.priorities[pos] = movedPri;
    }
    return top;
  }
}

export function resolveRoutingWeights(options: TerrainRouteOptions = {}): {
  preset: TerrainRoutePreset;
  avoidSwamp: boolean;
  avoidWater: boolean;
  climbWeight: number;
  slopePenalty: number;
  swampMultiplier: number;
  wetSwampMultiplier: number;
  allowNarrowSwampCrossing: boolean;
  altitudeWeight: number;
} {
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

function computeSwampCellMultipliers(
  grid: TerrainGrid,
  weights: ReturnType<typeof resolveRoutingWeights>,
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
          px1 >= 0 &&
          px1 < grid.width &&
          py1 >= 0 &&
          py1 < grid.height &&
          (grid.terrainFlags[py1 * grid.width + px1] & TERRAIN_SWAMP) !== 0;
        const perp2IsSwamp =
          px2 >= 0 &&
          px2 < grid.width &&
          py2 >= 0 &&
          py2 < grid.height &&
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

function computeGridElevationBounds(grid: TerrainGrid): {
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

function cellDistanceM(grid: TerrainGrid, ax: number, ay: number, bx: number, by: number): number {
  const dxM = (bx - ax) * grid.stepX * grid.metersPerUnit;
  const dyM = (by - ay) * grid.stepY * grid.metersPerUnit;
  return Math.hypot(dxM, dyM);
}

function stepCost(
  grid: TerrainGrid,
  fromIdx: number,
  toIdx: number,
  distM: number,
  allowWaterStep: boolean,
  weights: ReturnType<typeof resolveRoutingWeights>,
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
        grid,
        curIdx,
        nIdx,
        distM,
        allowWaterStep,
        weights,
        midElev,
        minGridElev,
        invElevRange,
        waterPenaltyMultiplier,
        swampMultipliers,
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
          waterPassMode === "fallback" ||
          curInWater ||
          nIdx === goalIdx ||
          nearWetStartOrGoal;

        let midElev: number | undefined;
        if (dx !== 0 && dy !== 0) {
          const c1Idx = curY * grid.width + nx;
          const c2Idx = ny * grid.width + curX;
          const cornerFlags = grid.terrainFlags[c1Idx] | grid.terrainFlags[c2Idx];
          if (
            weights.avoidWater &&
            waterPassMode === "strict" &&
            !curInWater &&
            !nearWetStartOrGoal &&
            (cornerFlags & TERRAIN_WATER) !== 0
          ) {
            continue;
          }
          midElev =
            0.25 *
            (grid.elevations[curIdx] +
              grid.elevations[nIdx] +
              grid.elevations[c1Idx] +
              grid.elevations[c2Idx]);
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
          waterPassMode === "fallback" ||
          curInWater ||
          nIdx === goalIdx ||
          nearWetStartOrGoal;

        const endpointMaxElev = Math.max(
          grid.elevations[curIdx],
          grid.elevations[nIdx],
        );
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
            if (
              weights.avoidWater &&
              waterPassMode === "strict" &&
              !curInWater &&
              (mFlags & TERRAIN_WATER) !== 0
            ) {
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
            curIdx,
            curG,
            nx,
            ny,
            knightDists[i],
            allowWaterStep,
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

function chordCostOnGrid(
  grid: TerrainGrid,
  a: GridPoint,
  b: GridPoint,
  allowWater: boolean,
  allowSwamp: boolean,
  isBaselineStep: boolean,
  weights: ReturnType<typeof resolveRoutingWeights>,
  minGridElev = 0,
  invElevRange = 0,
  allowWetSwamp = false,
  swampMultipliers: Float32Array | null = null,
): number {
  const gridSpan = Math.hypot(b.x - a.x, b.y - a.y);
  const substeps = Math.max(1, Math.ceil(gridSpan * 4));
  const totalDistM = cellDistanceM(grid, a.x, a.y, b.x, b.y);
  const stepDistM = totalDistM / substeps;
  const startFlags = grid.terrainFlags[a.y * grid.width + a.x];
  const startInSwamp = (startFlags & TERRAIN_SWAMP) !== 0;
  const startInWetSwamp = (startFlags & TERRAIN_SWAMP_WET) !== 0;
  let totalCost = 0;
  let prevElev = sampleElevationBilinear(
    grid,
    grid.minX + a.x * grid.stepX,
    grid.minY + a.y * grid.stepY,
  );
  for (let s = 1; s <= substeps; s++) {
    const t = s / substeps;
    const gx = a.x + (b.x - a.x) * t;
    const gy = a.y + (b.y - a.y) * t;
    const x0 = Math.max(0, Math.min(grid.width - 1, Math.round(gx - 0.35)));
    const x1 = Math.max(0, Math.min(grid.width - 1, Math.round(gx + 0.35)));
    const y0 = Math.max(0, Math.min(grid.height - 1, Math.round(gy - 0.35)));
    const y1 = Math.max(0, Math.min(grid.height - 1, Math.round(gy + 0.35)));

    const quadFlags =
      grid.terrainFlags[y0 * grid.width + x0] |
      grid.terrainFlags[y0 * grid.width + x1] |
      grid.terrainFlags[y1 * grid.width + x0] |
      grid.terrainFlags[y1 * grid.width + x1];

    if (!isBaselineStep && weights.avoidWater && !allowWater && (quadFlags & TERRAIN_WATER) !== 0) {
      return Infinity;
    }

    if (
      !isBaselineStep &&
      weights.avoidSwamp &&
      !allowSwamp &&
      s < substeps &&
      !startInSwamp &&
      (quadFlags & TERRAIN_SWAMP) !== 0
    ) {
      // Älä oikaise suon läpi silloin kun alkuperäinen polku kiertää suon
      return Infinity;
    }

    if (
      !isBaselineStep &&
      weights.avoidSwamp &&
      !allowWetSwamp &&
      s < substeps &&
      !startInWetSwamp &&
      (quadFlags & TERRAIN_SWAMP_WET) !== 0
    ) {
      return Infinity;
    }

    const rx = Math.max(0, Math.min(grid.width - 1, Math.round(gx)));
    const ry = Math.max(0, Math.min(grid.height - 1, Math.round(gy)));
    const centerIdx = ry * grid.width + rx;
    const centerFlags = grid.terrainFlags[centerIdx];

    let terrainMultiplier = 1;
    if (weights.avoidWater && (centerFlags & TERRAIN_WATER) !== 0) {
      if (!isBaselineStep && !allowWater) return Infinity;
      terrainMultiplier = 500;
    } else if (weights.avoidSwamp && (centerFlags & TERRAIN_SWAMP) !== 0) {
      terrainMultiplier = swampMultipliers ? swampMultipliers[centerIdx] : weights.swampMultiplier;
    }

    const elev = sampleElevationBilinear(
      grid,
      grid.minX + gx * grid.stepX,
      grid.minY + gy * grid.stepY,
    );
    const dh = elev - prevElev;
    const climb = dh > 0 ? dh : 0;
    const descent = prevElev > elev ? prevElev - elev : 0;
    const slopeTerm =
      climb > 0 && stepDistM > 0 ? weights.slopePenalty * ((climb * climb) / stepDistM) : 0;
    const descentSlopeTerm =
      descent > 0 && stepDistM > 0
        ? weights.slopePenalty * 0.15 * ((descent * descent) / stepDistM)
        : 0;
    const relAlt = invElevRange > 0 ? Math.max(0, (elev - minGridElev) * invElevRange) : 0;

    totalCost +=
      stepDistM * (terrainMultiplier + weights.altitudeWeight * relAlt) +
      weights.climbWeight * climb +
      slopeTerm +
      descentSlopeTerm;
    prevElev = elev;
  }

  return totalCost;
}

function pointToSegmentDistCells(p: GridPoint, a: GridPoint, b: GridPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function pruneRedundantVertices(
  grid: TerrainGrid,
  pts: GridPoint[],
  weights: ReturnType<typeof resolveRoutingWeights>,
  minGridElev: number,
  invElevRange: number,
  swampMultipliers: Float32Array | null = null,
): GridPoint[] {
  if (pts.length <= 2) return pts;

  const segCost = new Float64Array(pts.length);
  const swampPrefix = new Int32Array(pts.length);
  const wetSwampPrefix = new Int32Array(pts.length);
  const firstFlags = grid.terrainFlags[pts[0].y * grid.width + pts[0].x];
  swampPrefix[0] = (firstFlags & TERRAIN_SWAMP) !== 0 ? 1 : 0;
  wetSwampPrefix[0] = (firstFlags & TERRAIN_SWAMP_WET) !== 0 ? 1 : 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const bFlags = grid.terrainFlags[b.y * grid.width + b.x];
    const allowWater =
      weights.avoidWater &&
      (((grid.terrainFlags[a.y * grid.width + a.x] | bFlags) & TERRAIN_WATER) !== 0);
    segCost[i] =
      segCost[i - 1] +
      chordCostOnGrid(
        grid,
        a,
        b,
        allowWater,
        true,
        true,
        weights,
        minGridElev,
        invElevRange,
        true,
        swampMultipliers,
      );
    swampPrefix[i] = swampPrefix[i - 1] + ((bFlags & TERRAIN_SWAMP) !== 0 ? 1 : 0);
    wetSwampPrefix[i] = wetSwampPrefix[i - 1] + ((bFlags & TERRAIN_SWAMP_WET) !== 0 ? 1 : 0);
  }

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
        grid,
        pts[i],
        pts[j],
        false,
        allowSwamp,
        false,
        weights,
        minGridElev,
        invElevRange,
        allowWetSwamp,
        swampMultipliers,
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

  const prefixCost = new Float64Array(n);
  const prefixSwamp = new Int32Array(n);
  const prefixWetSwamp = new Int32Array(n);
  const firstSmoothFlags = grid.terrainFlags[path[0].y * grid.width + path[0].x];
  prefixSwamp[0] = (firstSmoothFlags & TERRAIN_SWAMP) !== 0 ? 1 : 0;
  prefixWetSwamp[0] = (firstSmoothFlags & TERRAIN_SWAMP_WET) !== 0 ? 1 : 0;

  for (let i = 1; i < n; i++) {
    const a = path[i - 1];
    const b = path[i];
    const aIdx = a.y * grid.width + a.x;
    const bIdx = b.y * grid.width + b.x;
    const bFlags = grid.terrainFlags[bIdx];
    const allowWater =
      weights.avoidWater &&
      (((grid.terrainFlags[aIdx] | bFlags) & TERRAIN_WATER) !== 0);
    prefixCost[i] =
      prefixCost[i - 1] +
      chordCostOnGrid(
        grid,
        a,
        b,
        allowWater,
        true,
        true,
        weights,
        minGridElev,
        invElevRange,
        true,
        swampMultipliers,
      );
    prefixSwamp[i] = prefixSwamp[i - 1] + ((bFlags & TERRAIN_SWAMP) !== 0 ? 1 : 0);
    prefixWetSwamp[i] = prefixWetSwamp[i - 1] + ((bFlags & TERRAIN_SWAMP_WET) !== 0 ? 1 : 0);
  }

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
        grid,
        path[i],
        path[cand],
        false,
        allowSwamp,
        false,
        weights,
        minGridElev,
        invElevRange,
        allowWetSwamp,
        swampMultipliers,
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

  const original = measureMercatorPolylineStats(grid, waypointsMercator);
  const fullPath: [number, number][] = [waypointsMercator[0]];

  for (let i = 0; i < waypointsMercator.length - 1; i++) {
    const startPt = waypointsMercator[i];
    const endPt = waypointsMercator[i + 1];
    const startCell = mercatorToGridCell(grid, startPt[0], startPt[1]);
    const endCell = mercatorToGridCell(grid, endPt[0], endPt[1]);
    const rawGridPath = findLowestClimbGridPath(grid, startCell, endCell, options);
    const smoothed = smoothGridPath(grid, rawGridPath, options);

    for (let j = 1; j < smoothed.length - 1; j++) {
      fullPath.push(gridCellToMercator(grid, smoothed[j]));
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
