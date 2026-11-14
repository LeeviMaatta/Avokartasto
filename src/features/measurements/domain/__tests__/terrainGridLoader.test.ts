import { describe, expect, it } from "vitest";
import { fromLonLat } from "ol/proj";
import {
  TERRAIN_SWAMP,
  TERRAIN_SWAMP_WET,
  TERRAIN_WATER,
  gridCellToMercator,
  mercatorToGridCell,
  routeMercatorWaypointsOnGrid,
  type TerrainGrid,
} from "../terrainRouting";
import {
  classifyWetlandFlags,
  computeTerrainGridSpec,
  decodeTerrariumRgb,
  rasterizeOverpassElementsToGrid,
  rasterizeVectorObstaclesToGrid,
  type OverpassElement,
} from "../terrainGridLoader";
import { executeTerrainRouteCompute } from "../terrainCompute";
import { createTestGrid } from "./terrainTestHelpers";

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

  it("classifies wet wetland subtypes with TERRAIN_SWAMP_WET and firmer subtypes with TERRAIN_SWAMP", () => {
    expect(classifyWetlandFlags("marsh")).toBe(TERRAIN_SWAMP | TERRAIN_SWAMP_WET);
    expect(classifyWetlandFlags("reedbed")).toBe(TERRAIN_SWAMP | TERRAIN_SWAMP_WET);
    expect(classifyWetlandFlags("string_bog")).toBe(TERRAIN_SWAMP | TERRAIN_SWAMP_WET);
    expect(classifyWetlandFlags("fen")).toBe(TERRAIN_SWAMP | TERRAIN_SWAMP_WET);

    expect(classifyWetlandFlags("bog")).toBe(TERRAIN_SWAMP);
    expect(classifyWetlandFlags("swamp")).toBe(TERRAIN_SWAMP);
    expect(classifyWetlandFlags("wet_meadow")).toBe(TERRAIN_SWAMP);
    expect(classifyWetlandFlags(undefined)).toBe(TERRAIN_SWAMP);

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
        type: "way",
        id: 10,
        tags: { natural: "wetland", wetland: "marsh" },
        geometry: [
          { lat: 60.202, lon: 25.002 },
          { lat: 60.202, lon: 25.007 },
          { lat: 60.206, lon: 25.007 },
          { lat: 60.206, lon: 25.002 },
          { lat: 60.202, lon: 25.002 },
        ],
      },
      {
        type: "way",
        id: 11,
        tags: { natural: "wetland", wetland: "bog" },
        geometry: [
          { lat: 60.202, lon: 25.012 },
          { lat: 60.202, lon: 25.017 },
          { lat: 60.206, lon: 25.017 },
          { lat: 60.206, lon: 25.012 },
          { lat: 60.202, lon: 25.012 },
        ],
      },
    ];

    rasterizeOverpassElementsToGrid(grid, elements, true, true, false);

    const marshPt = fromLonLat([25.0045, 60.204]);
    const marshCell = mercatorToGridCell(grid, marshPt[0], marshPt[1]);
    expect(grid.terrainFlags[marshCell.y * grid.width + marshCell.x]).toBe(
      TERRAIN_SWAMP | TERRAIN_SWAMP_WET,
    );

    const bogPt = fromLonLat([25.0145, 60.204]);
    const bogCell = mercatorToGridCell(grid, bogPt[0], bogPt[1]);
    expect(grid.terrainFlags[bogCell.y * grid.width + bogCell.x]).toBe(TERRAIN_SWAMP);
  });
});
