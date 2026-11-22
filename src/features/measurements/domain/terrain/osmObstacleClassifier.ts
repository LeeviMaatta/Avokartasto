import { fromLonLat } from "ol/proj";
import { TERRAIN_SWAMP, TERRAIN_SWAMP_WET, TERRAIN_WATER, type TerrainGrid } from "./terrainTypes";
import {
  assembleMultipolygonRings,
  pointsClose,
  rasterizePolygonWithHoles,
  rasterizePolyline,
} from "./polygonRasterizer";

export interface OverpassPoint {
  lat: number;
  lon: number;
}

export interface OverpassMember {
  type: string;
  role?: string;
  geometry?: OverpassPoint[];
}

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassPoint[];
  members?: OverpassMember[];
}

export interface VectorObstaclePolygon {
  flag: number;
  rings: [number, number][][];
}

export interface VectorObstaclePolyline {
  flag: number;
  isStream?: boolean;
  coords: [number, number][];
}

const WET_SWAMP_SUBTYPES = new Set([
  "marsh",
  "reedbed",
  "string_bog",
  "fen",
  "tidalflat",
  "mangrove",
  "saltmarsh",
  "mud",
  "quagmire",
]);

export function classifyWetlandFlags(
  subclassOrType?: string | null,
  tags?: Record<string, string>,
): number {
  const subtype = typeof subclassOrType === "string" ? subclassOrType.toLowerCase() : "";
  if (
    WET_SWAMP_SUBTYPES.has(subtype) ||
    tags?.natural === "mud" ||
    tags?.waterlogged === "yes"
  ) {
    return TERRAIN_SWAMP | TERRAIN_SWAMP_WET;
  }
  return TERRAIN_SWAMP;
}

function classifyElementFlag(
  tags: Record<string, string> | undefined,
  includeStreams: boolean,
): number {
  if (!tags) return 0;
  if (tags.natural === "wetland" || typeof tags.wetland === "string" || tags.natural === "mud") {
    return classifyWetlandFlags(tags.wetland ?? (tags.natural === "mud" ? "mud" : undefined), tags);
  }
  if (tags.waterway === "stream") {
    return includeStreams ? TERRAIN_WATER : 0;
  }
  if (
    tags.natural === "water" ||
    tags.waterway === "river" ||
    tags.waterway === "canal" ||
    tags.waterway === "riverbank" ||
    tags.landuse === "reservoir" ||
    tags.landuse === "basin"
  ) {
    return TERRAIN_WATER;
  }
  return 0;
}

/** Muuntaa Overpass API:n palauttamat suo- ja vesistöelementit suoraan hilabiteiksi. */
export function rasterizeOverpassElementsToGrid(
  grid: TerrainGrid,
  elements: OverpassElement[],
  includeSwamp: boolean,
  includeWater: boolean,
  includeStreams = false,
): void {
  const toMercatorRing = (pts: OverpassPoint[]): [number, number][] =>
    pts.map((pt) => fromLonLat([pt.lon, pt.lat]) as [number, number]);

  for (const el of elements) {
    const flag = classifyElementFlag(el.tags, includeStreams);
    if (flag === 0) continue;
    const isSwamp = (flag & TERRAIN_SWAMP) !== 0;
    const isWater = (flag & TERRAIN_WATER) !== 0;
    if (isSwamp && !includeSwamp) continue;
    if (isWater && !includeWater) continue;

    if (el.type === "way" && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      const ring = toMercatorRing(el.geometry);
      const isArea =
        ring.length >= 4 &&
        (pointsClose(ring[0], ring[ring.length - 1]) || isSwamp || el.tags?.natural === "water");
      if (isArea) {
        if (!pointsClose(ring[0], ring[ring.length - 1])) ring.push(ring[0]);
        rasterizePolygonWithHoles(grid, [ring], [], flag);
      } else {
        rasterizePolyline(grid, ring, flag);
      }
    } else if (el.type === "relation" && Array.isArray(el.members)) {
      const outerSegs: [number, number][][] = [];
      const innerSegs: [number, number][][] = [];
      for (const m of el.members) {
        if (!Array.isArray(m.geometry) || m.geometry.length < 2) continue;
        const seg = toMercatorRing(m.geometry);
        if (m.role === "inner") innerSegs.push(seg);
        else outerSegs.push(seg);
      }
      const outerRings = assembleMultipolygonRings(outerSegs);
      const innerRings = assembleMultipolygonRings(innerSegs);
      rasterizePolygonWithHoles(grid, outerRings, innerRings, flag);
    }
  }
}

/** Rasteroi valmiiksi EPSG:3857-koordinaateissa olevat vektoritiilien suo- ja vesistökohteet hilaan. */
export function rasterizeVectorObstaclesToGrid(
  grid: TerrainGrid,
  polygons: VectorObstaclePolygon[],
  polylines: VectorObstaclePolyline[],
  includeSwamp: boolean,
  includeWater: boolean,
  includeStreams = false,
): void {
  for (let i = 0; i < polygons.length; i++) {
    const poly = polygons[i];
    if ((poly.flag & TERRAIN_SWAMP) !== 0 && !includeSwamp) continue;
    if ((poly.flag & TERRAIN_WATER) !== 0 && !includeWater) continue;
    if (poly.rings.length === 0) continue;
    rasterizePolygonWithHoles(grid, [poly.rings[0]], poly.rings.slice(1), poly.flag);
  }

  for (let i = 0; i < polylines.length; i++) {
    const line = polylines[i];
    if ((line.flag & TERRAIN_WATER) !== 0) {
      if (!includeWater) continue;
      if (line.isStream && !includeStreams) continue;
    } else if ((line.flag & TERRAIN_SWAMP) !== 0 && !includeSwamp) {
      continue;
    }
    if (line.coords.length >= 2) {
      rasterizePolyline(grid, line.coords, line.flag);
    }
  }
}
