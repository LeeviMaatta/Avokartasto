import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import { toLonLat } from "ol/proj";
import { getLength } from "ol/sphere";
import {
  routeMercatorWaypointsOnGrid,
  sampleElevationBilinear,
  type TerrainGrid,
  type TerrainRouteOptions,
  type TerrainRouteStats,
} from "./terrainRouting";
import {
  classifyWetlandFlags,
  rasterizeOverpassElementsToGrid,
  rasterizeVectorObstaclesToGrid,
  type OverpassElement,
  type OverpassMember,
  type OverpassPoint,
  type VectorObstaclePolygon,
  type VectorObstaclePolyline,
} from "./terrain/osmObstacleClassifier";

export {
  classifyWetlandFlags,
  rasterizeOverpassElementsToGrid,
  rasterizeVectorObstaclesToGrid,
  type OverpassElement,
  type OverpassMember,
  type OverpassPoint,
  type VectorObstaclePolygon,
  type VectorObstaclePolyline,
};

export interface TerrainProfilePoint {
  dist: number;
  elev: number;
}

export interface TerrainComputeInput {
  width: number;
  height: number;
  minX: number;
  minY: number;
  stepX: number;
  stepY: number;
  metersPerUnit: number;
  elevations: Float32Array;
  waypointsMercator: [number, number][];
  obstacles: OverpassElement[];
  vectorPolygons?: VectorObstaclePolygon[];
  vectorPolylines?: VectorObstaclePolyline[];
  options: TerrainRouteOptions;
}

export interface TerrainComputeOutput {
  coordinates: [number, number][];
  geojson: string;
  stats: TerrainRouteStats;
  profile: TerrainProfilePoint[];
}

/** Muodostaa optimoidulle reitille korkeusprofiilin suoraan korkeushilasta ilman verkkokyselyä. */
export function computeTerrainProfileFromGrid(
  grid: TerrainGrid,
  lineGeom: LineString,
): TerrainProfilePoint[] {
  const length = getLength(lineGeom, { projection: "EPSG:3857" });
  const n = Math.min(100, Math.max(2, Math.ceil(length / 100) + 1));
  const profile: TerrainProfilePoint[] = [];
  for (let i = 0; i < n; i++) {
    const fraction = i / (n - 1);
    const coord = lineGeom.getCoordinateAt(fraction);
    profile.push({
      dist: fraction * length,
      elev: Math.round(sampleElevationBilinear(grid, coord[0], coord[1])),
    });
  }
  return profile;
}

/** Ajaa rasteroinnin, reitinhakun ja korkeusprofiilin muodostuksen valmiilla hilalla. */
export function executeTerrainRouteCompute(input: TerrainComputeInput): TerrainComputeOutput {
  const grid: TerrainGrid = {
    width: input.width,
    height: input.height,
    minX: input.minX,
    minY: input.minY,
    stepX: input.stepX,
    stepY: input.stepY,
    metersPerUnit: input.metersPerUnit,
    elevations: input.elevations,
    terrainFlags: new Uint8Array(input.width * input.height),
  };

  const avoidSwamp = input.options.avoidSwamp ?? true;
  const avoidWater = input.options.avoidWater ?? true;
  const avoidStreams = input.options.avoidStreams ?? false;
  if (avoidSwamp || avoidWater) {
    if (input.vectorPolygons?.length || input.vectorPolylines?.length) {
      rasterizeVectorObstaclesToGrid(
        grid,
        input.vectorPolygons ?? [],
        input.vectorPolylines ?? [],
        avoidSwamp,
        avoidWater,
        avoidStreams,
      );
    }
    if (input.obstacles.length > 0) {
      rasterizeOverpassElementsToGrid(grid, input.obstacles, avoidSwamp, avoidWater, avoidStreams);
    }
  }

  const { coordinatesMercator, stats } = routeMercatorWaypointsOnGrid(
    grid,
    input.waypointsMercator,
    input.options,
  );
  const lineGeom = new LineString(coordinatesMercator);
  const profile = computeTerrainProfileFromGrid(grid, lineGeom);
  const coordinates = coordinatesMercator.map((coord) => toLonLat(coord) as [number, number]);
  const geojson = new GeoJSON().writeGeometry(lineGeom, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });

  return { coordinates, geojson, stats, profile };
}
