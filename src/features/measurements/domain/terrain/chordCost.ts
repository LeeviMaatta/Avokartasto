import {
  TERRAIN_SWAMP,
  TERRAIN_SWAMP_WET,
  TERRAIN_WATER,
  type GridPoint,
  type TerrainGrid,
} from "./terrainTypes";
import {
  cellDistanceM,
  sampleElevationBilinear,
  type ResolvedRoutingWeights,
} from "./terrainCostModel";

/** Tarkistaa leikkaako kahden murto-osiluvuin annetun hilakoordinaatin välinen jana vesiruutua. */
export function segmentTouchesWaterOnGrid(
  grid: TerrainGrid,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const span = Math.hypot(bx - ax, by - ay);
  const substeps = Math.max(2, Math.ceil(span * 6));
  for (let s = 0; s <= substeps; s++) {
    const t = s / substeps;
    const gx = ax + (bx - ax) * t;
    const gy = ay + (by - ay) * t;
    const fx0 = Math.max(0, Math.min(grid.width - 1, Math.floor(gx)));
    const fx1 = Math.max(0, Math.min(grid.width - 1, Math.ceil(gx)));
    const fy0 = Math.max(0, Math.min(grid.height - 1, Math.floor(gy)));
    const fy1 = Math.max(0, Math.min(grid.height - 1, Math.ceil(gy)));
    const flags =
      grid.terrainFlags[fy0 * grid.width + fx0] |
      grid.terrainFlags[fy0 * grid.width + fx1] |
      grid.terrainFlags[fy1 * grid.width + fx0] |
      grid.terrainFlags[fy1 * grid.width + fx1];
    if ((flags & TERRAIN_WATER) !== 0) return true;
  }
  return false;
}

export function chordCostOnGrid(
  grid: TerrainGrid,
  a: GridPoint,
  b: GridPoint,
  allowWater: boolean,
  allowSwamp: boolean,
  isBaselineStep: boolean,
  weights: ResolvedRoutingWeights,
  minGridElev = 0,
  invElevRange = 0,
  allowWetSwamp = false,
  swampMultipliers: Float32Array | null = null,
): number {
  const gridSpan = Math.hypot(b.x - a.x, b.y - a.y);
  const substeps = Math.max(2, Math.ceil(gridSpan * 6));
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
    const fx0 = Math.max(0, Math.min(grid.width - 1, Math.floor(gx)));
    const fx1 = Math.max(0, Math.min(grid.width - 1, Math.ceil(gx)));
    const fy0 = Math.max(0, Math.min(grid.height - 1, Math.floor(gy)));
    const fy1 = Math.max(0, Math.min(grid.height - 1, Math.ceil(gy)));
    const waterQuadFlags =
      grid.terrainFlags[fy0 * grid.width + fx0] |
      grid.terrainFlags[fy0 * grid.width + fx1] |
      grid.terrainFlags[fy1 * grid.width + fx0] |
      grid.terrainFlags[fy1 * grid.width + fx1];

    if (!isBaselineStep && weights.avoidWater && !allowWater && (waterQuadFlags & TERRAIN_WATER) !== 0) {
      return Infinity;
    }

    const x0 = Math.max(0, Math.min(grid.width - 1, Math.round(gx - 0.35)));
    const x1 = Math.max(0, Math.min(grid.width - 1, Math.round(gx + 0.35)));
    const y0 = Math.max(0, Math.min(grid.height - 1, Math.round(gy - 0.35)));
    const y1 = Math.max(0, Math.min(grid.height - 1, Math.round(gy + 0.35)));

    const quadFlags =
      grid.terrainFlags[y0 * grid.width + x0] |
      grid.terrainFlags[y0 * grid.width + x1] |
      grid.terrainFlags[y1 * grid.width + x0] |
      grid.terrainFlags[y1 * grid.width + x1];

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
    } else if (swampMultipliers && swampMultipliers[centerIdx] > 0) {
      terrainMultiplier = swampMultipliers[centerIdx];
    } else if (weights.avoidSwamp && (centerFlags & TERRAIN_SWAMP) !== 0) {
      terrainMultiplier = weights.swampMultiplier;
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
