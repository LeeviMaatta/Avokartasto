import { describe, expect, it } from "vitest";
import {
  TERRAIN_NONE,
  TERRAIN_SWAMP,
  TERRAIN_SWAMP_WET,
  TERRAIN_WATER,
  gridCellToMercator,
  mercatorToGridCell,
  routeMercatorWaypointsOnGrid,
} from "../terrainRouting";
import { createTestGrid } from "./terrainTestHelpers";

describe("terrainRouting", () => {
  it("routes around a steep hill to minimize total climb", () => {
    // Keskellä (x=10..14, y=8..20) kulkee korkea harjanne (80 m), pohjoisen kautta (y=3) tasainen kiertotie (10 m)
    const grid = createTestGrid(25, 25, 20, (x, y) => {
      if (x >= 10 && x <= 14 && y >= 7 && y <= 22) {
        return 80;
      }
      return 10;
    });

    const start = gridCellToMercator(grid, { x: 4, y: 14 });
    const goal = gridCellToMercator(grid, { x: 20, y: 14 });
    const result = routeMercatorWaypointsOnGrid(grid, [start, goal], {
      preset: "min-climb",
      avoidSwamp: true,
      avoidWater: true,
    });

    expect(result.stats.originalClimbM).toBeGreaterThan(60);
    expect(result.stats.routedClimbM).toBeLessThan(1);
    expect(result.coordinatesMercator.length).toBeGreaterThan(2);
    // Varmistaa että reitti kiersi harjanteen pohjoisreunan (y < 7) kautta
    const minY = Math.min(...result.coordinatesMercator.map((pt) => mercatorToGridCell(grid, pt[0], pt[1]).y));
    expect(minY).toBeLessThan(7);
  });

  it("avoids swamp cells when avoidSwamp is enabled and crosses directly when disabled", () => {
    const grid = createTestGrid(
      25,
      25,
      20,
      () => 15,
      (x, y) => (x >= 9 && x <= 15 && y >= 8 && y <= 16 ? TERRAIN_SWAMP : TERRAIN_NONE),
    );

    const start = gridCellToMercator(grid, { x: 4, y: 12 });
    const goal = gridCellToMercator(grid, { x: 20, y: 12 });

    const detour = routeMercatorWaypointsOnGrid(grid, [start, goal], { avoidSwamp: true });
    const touchedSwampWithDetour = detour.coordinatesMercator.some((pt) => {
      const c = mercatorToGridCell(grid, pt[0], pt[1]);
      return (grid.terrainFlags[c.y * grid.width + c.x] & TERRAIN_SWAMP) !== 0;
    });
    expect(touchedSwampWithDetour).toBe(false);
    expect(detour.stats.routedLengthM).toBeGreaterThan(detour.stats.originalLengthM);

    const direct = routeMercatorWaypointsOnGrid(grid, [start, goal], { avoidSwamp: false });
    expect(direct.coordinatesMercator).toHaveLength(2);
  });

  it("avoids flat water barriers even though water has 0 m climb, and can exit if start is in water", () => {
    const grid = createTestGrid(
      25,
      25,
      20,
      (x, y) => (x >= 10 && x <= 14 && y >= 7 && y <= 18 ? 0 : 12),
      (x, y) => (x >= 10 && x <= 14 && y >= 7 && y <= 18 ? TERRAIN_WATER : TERRAIN_NONE),
    );

    const dryStart = gridCellToMercator(grid, { x: 4, y: 12 });
    const dryGoal = gridCellToMercator(grid, { x: 20, y: 12 });
    const dryRoute = routeMercatorWaypointsOnGrid(grid, [dryStart, dryGoal], { avoidWater: true });
    const touchedWater = dryRoute.coordinatesMercator.some((pt) => {
      const c = mercatorToGridCell(grid, pt[0], pt[1]);
      return (grid.terrainFlags[c.y * grid.width + c.x] & TERRAIN_WATER) !== 0;
    });
    expect(touchedWater).toBe(false);

    // Lähtöpiste vahingossa vedessä -> pääsee pois eikä jää jumiin
    const wetStart = gridCellToMercator(grid, { x: 11, y: 12 });
    const exitRoute = routeMercatorWaypointsOnGrid(grid, [wetStart, dryGoal], { avoidWater: true });
    expect(exitRoute.coordinatesMercator.length).toBeGreaterThan(2);
    expect(exitRoute.coordinatesMercator[0]).toEqual(wetStart);
    expect(exitRoute.coordinatesMercator[exitRoute.coordinatesMercator.length - 1]).toEqual(dryGoal);
  });

  it("preserves intermediate waypoints across multi-segment measurements", () => {
    const grid = createTestGrid(25, 25, 20, (x, y) => (x === 12 && y >= 5 && y <= 19 ? 60 : 5));
    const a = gridCellToMercator(grid, { x: 3, y: 12 });
    const b = gridCellToMercator(grid, { x: 12, y: 3 });
    const c = gridCellToMercator(grid, { x: 21, y: 12 });

    const res = routeMercatorWaypointsOnGrid(grid, [a, b, c], { preset: "min-climb" });
    expect(res.coordinatesMercator[0]).toEqual(a);
    expect(res.coordinatesMercator[res.coordinatesMercator.length - 1]).toEqual(c);
    const hasWaypointB = res.coordinatesMercator.some(
      (pt) => Math.abs(pt[0] - b[0]) < 1e-6 && Math.abs(pt[1] - b[1]) < 1e-6,
    );
    expect(hasWaypointB).toBe(true);
  });

  it("prefers the lower valley floor over a higher plateau when climb is equal", () => {
    // Molemmilla vaihtoehdoilla nousua 0 m (lasku 50m -> 10m), mutta matalampi laakso (y <= 6, 15m)
    // on korkeammalla tasanteella (45m) pysymistä edullisempi
    const grid = createTestGrid(20, 20, 20, (x, y) => {
      if (x <= 2) return 50;
      if (x >= 17) return 10;
      if (y <= 6) return 15;
      return 45;
    });

    const start = gridCellToMercator(grid, { x: 1, y: 10 });
    const goal = gridCellToMercator(grid, { x: 18, y: 10 });
    const res = routeMercatorWaypointsOnGrid(grid, [start, goal], {
      preset: "balanced",
      avoidSwamp: false,
      avoidWater: false,
    });

    const minY = Math.min(
      ...res.coordinatesMercator.map((p) => mercatorToGridCell(grid, p[0], p[1]).y),
    );
    expect(minY).toBeLessThanOrEqual(6);
  });

  it("simplifies long straight/angled runs near shoreline and swamp without leaving per-cell stairsteps", () => {
    // Pitkä reitti rannan (y <= 4) ja suon (y >= 11) välissä lievällä korkeusaaltoilulla
    const grid = createTestGrid(
      70,
      20,
      25,
      (x, y) => 20 + Math.sin(x * 0.25) * 0.4 + y * 0.1,
      (x, y) => {
        if (y <= 4) return TERRAIN_WATER;
        if (y >= 11 && x >= 15 && x <= 55) return TERRAIN_SWAMP;
        return TERRAIN_NONE;
      },
    );

    const start = gridCellToMercator(grid, { x: 2, y: 6 });
    const goal = gridCellToMercator(grid, { x: 67, y: 9 });
    const res = routeMercatorWaypointsOnGrid(grid, [start, goal], {
      preset: "balanced",
      avoidWater: true,
      avoidSwamp: true,
    });

    // Lähes suoran 65 ruudun matkan ei tule sisältää kymmeniä välipisteitä
    expect(res.coordinatesMercator.length).toBeLessThanOrEqual(5);
  });

  it("crosses a narrow swamp neck in balanced mode instead of making a long detour, while min-climb detours", () => {
    // Suoalue y=2..22, leveä (x=8..17) paitsi kapeassa kuroumassa y=12 (x=12..13)
    const grid = createTestGrid(
      26,
      25,
      20,
      () => 15,
      (x, y) => {
        if (y < 2 || y > 22) return TERRAIN_NONE;
        if (y === 12) return x >= 12 && x <= 13 ? TERRAIN_SWAMP : TERRAIN_NONE;
        return x >= 8 && x <= 17 ? TERRAIN_SWAMP : TERRAIN_NONE;
      },
    );

    const start = gridCellToMercator(grid, { x: 4, y: 12 });
    const goal = gridCellToMercator(grid, { x: 21, y: 12 });

    const balanced = routeMercatorWaypointsOnGrid(grid, [start, goal], {
      preset: "balanced",
      avoidSwamp: true,
      avoidWater: true,
    });
    const balancedYs = balanced.coordinatesMercator.map((pt) => mercatorToGridCell(grid, pt[0], pt[1]).y);
    expect(Math.min(...balancedYs)).toBeGreaterThanOrEqual(11);
    expect(Math.max(...balancedYs)).toBeLessThanOrEqual(13);
    expect(balanced.stats.routedLengthM).toBeLessThan(balanced.stats.originalLengthM + 20);

    const minClimb = routeMercatorWaypointsOnGrid(grid, [start, goal], {
      preset: "min-climb",
      avoidSwamp: true,
      avoidWater: true,
    });
    const minClimbYs = minClimb.coordinatesMercator.map((pt) => mercatorToGridCell(grid, pt[0], pt[1]).y);
    expect(Math.min(...minClimbYs) < 2 || Math.max(...minClimbYs) > 22).toBe(true);
    expect(minClimb.stats.routedLengthM).toBeGreaterThan(balanced.stats.routedLengthM * 1.3);
  });

  it("detours around even a narrow swamp neck in balanced mode when the swamp is marked wettest", () => {
    const grid = createTestGrid(
      26,
      25,
      20,
      () => 15,
      (x, y) => {
        if (y < 2 || y > 22) return TERRAIN_NONE;
        if (y === 12) {
          return x >= 12 && x <= 13 ? TERRAIN_SWAMP | TERRAIN_SWAMP_WET : TERRAIN_NONE;
        }
        return x >= 8 && x <= 17 ? TERRAIN_SWAMP : TERRAIN_NONE;
      },
    );

    const start = gridCellToMercator(grid, { x: 4, y: 12 });
    const goal = gridCellToMercator(grid, { x: 21, y: 12 });

    const balancedWet = routeMercatorWaypointsOnGrid(grid, [start, goal], {
      preset: "balanced",
      avoidSwamp: true,
      avoidWater: true,
    });
    const ys = balancedWet.coordinatesMercator.map((pt) => mercatorToGridCell(grid, pt[0], pt[1]).y);
    expect(Math.min(...ys) < 2 || Math.max(...ys) > 22).toBe(true);
    const touchedWet = balancedWet.coordinatesMercator.some((pt) => {
      const c = mercatorToGridCell(grid, pt[0], pt[1]);
      return (grid.terrainFlags[c.y * grid.width + c.x] & TERRAIN_SWAMP_WET) !== 0;
    });
    expect(touchedWet).toBe(false);
  });

  it("never clips diagonally across shoreline water corners in balanced mode", () => {
    // Järvenlahti kurottuu kohti reittiä (x=10..13, y<=11), jonka takana on kuivaa metsämaata (y>=12)
    const grid = createTestGrid(
      26,
      20,
      25,
      (x, y) => (y >= 12 ? 12 + (x % 3) * 0.2 : 10),
      (x, y) => {
        if (y <= 9) return TERRAIN_WATER;
        if (y <= 11 && x >= 10 && x <= 13) return TERRAIN_WATER;
        return TERRAIN_NONE;
      },
    );

    const start = gridCellToMercator(grid, { x: 4, y: 10 });
    const goal = gridCellToMercator(grid, { x: 20, y: 10 });
    const res = routeMercatorWaypointsOnGrid(grid, [start, goal], {
      preset: "balanced",
      avoidSwamp: true,
      avoidWater: true,
    });

    // Tarkistetaan tiheällä näytteistyksellä koko reittiviivalta ettei yksikään piste tai segmentti osu veteen
    for (let i = 1; i < res.coordinatesMercator.length; i++) {
      const [x0, y0] = res.coordinatesMercator[i - 1];
      const [x1, y1] = res.coordinatesMercator[i];
      for (let s = 0; s <= 20; s++) {
        const t = s / 20;
        const c = mercatorToGridCell(grid, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        expect(grid.terrainFlags[c.y * grid.width + c.x] & TERRAIN_WATER).toBe(0);
      }
    }
  });
});
