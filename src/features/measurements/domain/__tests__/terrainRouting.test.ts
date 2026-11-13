import { describe, expect, it } from "vitest";
import { fromLonLat } from "ol/proj";
import {
  TERRAIN_NONE,
  TERRAIN_SWAMP,
  TERRAIN_WATER,
  gridCellToMercator,
  mercatorToGridCell,
  routeMercatorWaypointsOnGrid,
  type TerrainGrid,
} from "../terrainRouting";
import {
  computeTerrainGridSpec,
  decodeTerrariumRgb,
  rasterizeOverpassElementsToGrid,
  rasterizeVectorObstaclesToGrid,
  type OverpassElement,
} from "../terrainGridLoader";
import { executeTerrainRouteCompute } from "../terrainCompute";

function createTestGrid(
  width: number,
  height: number,
  stepM = 20,
  elevFn: (x: number, y: number) => number = () => 10,
  flagFn: (x: number, y: number) => number = () => TERRAIN_NONE,
): TerrainGrid {
  const elevations = new Float32Array(width * height);
  const terrainFlags = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      elevations[idx] = elevFn(x, y);
      terrainFlags[idx] = flagFn(x, y);
    }
  }
  return {
    width,
    height,
    minX: 2770000,
    minY: 8430000,
    stepX: stepM * 2,
    stepY: stepM * 2,
    metersPerUnit: 0.5,
    elevations,
    terrainFlags,
  };
}

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
});

describe("terrainGridLoader helpers", () => {
  it("decodes Terrarium RGB pixels to elevation meters", () => {
    expect(decodeTerrariumRgb(128, 0, 0)).toBe(0);
    expect(decodeTerrariumRgb(128, 100, 0)).toBe(100);
    expect(decodeTerrariumRgb(129, 0, 128)).toBe(256.5);
  });

  it("rasterizes OSM swamp multipolygons with dry inner islands and linear waterways", () => {
    const sw = fromLonLat([25.0, 60.2]) as [number, number];
    const ne = fromLonLat([25.02, 60.21]) as [number, number];
    const spec = computeTerrainGridSpec([sw, ne]);
    const grid: TerrainGrid = {
      width: spec.width,
      height: spec.height,
      minX: spec.minX,
      minY: spec.minY,
      stepX: spec.stepX,
      stepY: spec.stepY,
      metersPerUnit: spec.metersPerUnit,
      elevations: new Float32Array(spec.width * spec.height),
      terrainFlags: new Uint8Array(spec.width * spec.height),
    };

    const elements: OverpassElement[] = [
      {
        type: "relation",
        id: 1,
        tags: { natural: "wetland", wetland: "bog" },
        members: [
          {
            type: "way",
            role: "outer",
            geometry: [
              { lat: 60.201, lon: 25.002 },
              { lat: 60.201, lon: 25.018 },
              { lat: 60.209, lon: 25.018 },
              { lat: 60.209, lon: 25.002 },
              { lat: 60.201, lon: 25.002 },
            ],
          },
          {
            type: "way",
            role: "inner",
            geometry: [
              { lat: 60.204, lon: 25.008 },
              { lat: 60.204, lon: 25.012 },
              { lat: 60.206, lon: 25.012 },
              { lat: 60.206, lon: 25.008 },
              { lat: 60.204, lon: 25.008 },
            ],
          },
        ],
      },
      {
        type: "way",
        id: 2,
        tags: { waterway: "stream" },
        geometry: [
          { lat: 60.2005, lon: 25.001 },
          { lat: 60.2005, lon: 25.019 },
        ],
      },
    ];

    // Oletuksena purot (waterway=stream) jätetään huomioimatta nopeamman haun vuoksi
    rasterizeOverpassElementsToGrid(grid, elements, true, true, false);

    const swampCenter = fromLonLat([25.004, 60.205]);
    const swampCell = mercatorToGridCell(grid, swampCenter[0], swampCenter[1]);
    expect(grid.terrainFlags[swampCell.y * grid.width + swampCell.x] & TERRAIN_SWAMP).toBe(TERRAIN_SWAMP);

    // Kuiva saareke (inner ring) suon keskellä ei saa olla suota
    const islandCenter = fromLonLat([25.01, 60.205]);
    const islandCell = mercatorToGridCell(grid, islandCenter[0], islandCenter[1]);
    expect(grid.terrainFlags[islandCell.y * grid.width + islandCell.x] & TERRAIN_SWAMP).toBe(0);

    const streamPt = fromLonLat([25.01, 60.2005]);
    const streamCell = mercatorToGridCell(grid, streamPt[0], streamPt[1]);
    expect(grid.terrainFlags[streamCell.y * grid.width + streamCell.x] & TERRAIN_WATER).toBe(0);

    // Kun purot ja ojat otetaan käyttöön, waterway=stream merkitään vesistöksi
    rasterizeOverpassElementsToGrid(grid, elements, true, true, true);
    expect(grid.terrainFlags[streamCell.y * grid.width + streamCell.x] & TERRAIN_WATER).toBe(TERRAIN_WATER);
  });

  it("computes elevation profile directly from terrain grid without network fetch", () => {
    const grid = createTestGrid(20, 10, 20, (x) => 20 + x * 2);
    const start = gridCellToMercator(grid, { x: 2, y: 5 });
    const goal = gridCellToMercator(grid, { x: 16, y: 5 });

    const output = executeTerrainRouteCompute({
      width: grid.width,
      height: grid.height,
      minX: grid.minX,
      minY: grid.minY,
      stepX: grid.stepX,
      stepY: grid.stepY,
      metersPerUnit: grid.metersPerUnit,
      elevations: grid.elevations,
      waypointsMercator: [start, goal],
      obstacles: [],
      options: { preset: "min-climb", avoidSwamp: false, avoidWater: false },
    });

    expect(output.profile.length).toBeGreaterThanOrEqual(2);
    expect(output.profile[0].dist).toBe(0);
    expect(output.profile[output.profile.length - 1].elev).toBeGreaterThan(output.profile[0].elev);
  });

  it("rasterizes Mercator vector tile obstacles respecting swamp, water, and stream toggles", () => {
    const grid = createTestGrid(20, 20, 20, () => 10);
    const pt = (gx: number, gy: number): [number, number] => gridCellToMercator(grid, { x: gx, y: gy });

    const polygons = [
      {
        flag: TERRAIN_SWAMP,
        rings: [
          [pt(2, 2), pt(8, 2), pt(8, 8), pt(2, 8), pt(2, 2)],
          [pt(4, 4), pt(6, 4), pt(6, 6), pt(4, 6), pt(4, 4)],
        ],
      },
      {
        flag: TERRAIN_WATER,
        rings: [[pt(12, 12), pt(16, 12), pt(16, 16), pt(12, 16), pt(12, 12)]],
      },
    ];
    const polylines = [
      {
        flag: TERRAIN_WATER,
        isStream: true,
        coords: [pt(1, 14), pt(9, 14)],
      },
      {
        flag: TERRAIN_WATER,
        isStream: false,
        coords: [pt(1, 17), pt(9, 17)],
      },
    ];

    rasterizeVectorObstaclesToGrid(grid, polygons, polylines, true, true, false);
    expect(grid.terrainFlags[3 * grid.width + 3] & TERRAIN_SWAMP).toBe(TERRAIN_SWAMP);
    expect(grid.terrainFlags[5 * grid.width + 5] & TERRAIN_SWAMP).toBe(0); // Kuiva saareke
    expect(grid.terrainFlags[14 * grid.width + 14] & TERRAIN_WATER).toBe(TERRAIN_WATER);
    expect(grid.terrainFlags[17 * grid.width + 5] & TERRAIN_WATER).toBe(TERRAIN_WATER);
    expect(grid.terrainFlags[14 * grid.width + 5] & TERRAIN_WATER).toBe(0); // Puro ohitettu kun false

    rasterizeVectorObstaclesToGrid(grid, polygons, polylines, true, true, true);
    expect(grid.terrainFlags[14 * grid.width + 5] & TERRAIN_WATER).toBe(TERRAIN_WATER);
  });

  it("detours around a narrow diagonal lake even when goal touches shoreline water", () => {
    const grid = createTestGrid(22, 22, 20, () => 10);
    const pt = (gx: number, gy: number): [number, number] => gridCellToMercator(grid, { x: gx, y: gy });

    // Kapea diagonaalinen järvi ja rantamatala maalin lähellä
    rasterizeVectorObstaclesToGrid(
      grid,
      [
        {
          flag: TERRAIN_WATER,
          rings: [
            [
              pt(8.2, 5.2),
              pt(13.8, 13.8),
              pt(14.6, 13.3),
              pt(9.0, 4.7),
              pt(8.2, 5.2),
            ],
          ],
        },
      ],
      [],
      true,
      true,
      false,
    );

    const start = pt(3, 10);
    const goal = pt(15, 13);
    const res = routeMercatorWaypointsOnGrid(grid, [start, goal], {
      preset: "min-climb",
      avoidWater: true,
      avoidSwamp: true,
    });

    expect(res.coordinatesMercator.length).toBeGreaterThan(2);
    // Välietappien väliset pisteet eivät saa oikaista keskellä järveä
    const midWetHits = res.coordinatesMercator.slice(1, -1).filter(([x, y]) => {
      const c = mercatorToGridCell(grid, x, y);
      return (grid.terrainFlags[c.y * grid.width + c.x] & TERRAIN_WATER) !== 0;
    });
    expect(midWetHits.length).toBe(0);
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
});
