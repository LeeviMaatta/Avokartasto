import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import { fromLonLat, toLonLat } from "ol/proj";
import { getLength } from "ol/sphere";
import {
  TERRAIN_SWAMP,
  TERRAIN_SWAMP_WET,
  TERRAIN_WATER,
  routeMercatorWaypointsOnGrid,
  sampleElevationBilinear,
  type TerrainGrid,
  type TerrainRouteOptions,
  type TerrainRouteStats,
} from "./terrainRouting";

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

export interface TerrainProfilePoint {
  dist: number;
  elev: number;
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

interface RingBounds {
  ring: [number, number][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function pointsClose(a: [number, number], b: [number, number]): boolean {
  return Math.abs(a[0] - b[0]) < 1e-4 && Math.abs(a[1] - b[1]) < 1e-4;
}

/**
 * Yhdistää OSM-multipolygonin peräkkäisistä way-segmenteistä suljetut renkaat.
 */
export function assembleMultipolygonRings(segments: [number, number][][]): [number, number][][] {
  const closed: [number, number][][] = [];
  const open = segments.filter((seg) => seg.length >= 2).map((seg) => [...seg]);

  const remaining: [number, number][][] = [];
  for (const seg of open) {
    if (seg.length >= 4 && pointsClose(seg[0], seg[seg.length - 1])) {
      closed.push(seg);
    } else {
      remaining.push(seg);
    }
  }

  while (remaining.length > 0) {
    const current = remaining.shift()!;
    let merged = true;
    while (merged && !pointsClose(current[0], current[current.length - 1])) {
      merged = false;
      const tail = current[current.length - 1];
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        if (pointsClose(tail, candidate[0])) {
          current.push(...candidate.slice(1));
          remaining.splice(i, 1);
          merged = true;
          break;
        }
        if (pointsClose(tail, candidate[candidate.length - 1])) {
          const rev = [...candidate].reverse();
          current.push(...rev.slice(1));
          remaining.splice(i, 1);
          merged = true;
          break;
        }
      }
    }
    if (current.length >= 3) {
      if (!pointsClose(current[0], current[current.length - 1])) {
        current.push(current[0]);
      }
      closed.push(current);
    }
  }
  return closed;
}

function measureRingBounds(ring: [number, number][]): RingBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const x = ring[i][0];
    const y = ring[i][1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { ring, minX, minY, maxX, maxY };
}

function pointInRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygonWithHoles(
  x: number,
  y: number,
  outer: [number, number][],
  relevantInners: RingBounds[],
): boolean {
  if (!pointInRing(x, y, outer)) return false;
  for (let k = 0; k < relevantInners.length; k++) {
    const inner = relevantInners[k];
    if (
      x >= inner.minX &&
      x <= inner.maxX &&
      y >= inner.minY &&
      y <= inner.maxY &&
      pointInRing(x, y, inner.ring)
    ) {
      return false;
    }
  }
  return true;
}

function rasterizePolygonWithHoles(
  grid: TerrainGrid,
  outerRings: [number, number][][],
  innerRings: [number, number][][],
  flag: number,
): void {
  if (outerRings.length === 0) return;

  const innerBounds: RingBounds[] = innerRings
    .filter((ring) => ring.length >= 3)
    .map(measureRingBounds);
  const subDx = grid.stepX * 0.35;
  const subDy = grid.stepY * 0.35;
  const edgeStep = Math.min(grid.stepX, grid.stepY) * 0.25;

  for (const outer of outerRings) {
    if (outer.length < 3) continue;
    const outerBbox = measureRingBounds(outer);
    const gx0 = Math.max(0, Math.floor((outerBbox.minX - grid.minX) / grid.stepX));
    const gx1 = Math.min(grid.width - 1, Math.ceil((outerBbox.maxX - grid.minX) / grid.stepX));
    const gy0 = Math.max(0, Math.floor((outerBbox.minY - grid.minY) / grid.stepY));
    const gy1 = Math.min(grid.height - 1, Math.ceil((outerBbox.maxY - grid.minY) / grid.stepY));
    if (gx1 < gx0 || gy1 < gy0) continue;

    // Esisuodatetaan vain tämän ulkorenkaan bboxin kanssa leikkaavat sisäsaarekkeet
    const relevantInners = innerBounds.filter(
      (inner) =>
        inner.maxX >= outerBbox.minX &&
        inner.minX <= outerBbox.maxX &&
        inner.maxY >= outerBbox.minY &&
        inner.minY <= outerBbox.maxY,
    );

    for (let gy = gy0; gy <= gy1; gy++) {
      const py = grid.minY + gy * grid.stepY;
      for (let gx = gx0; gx <= gx1; gx++) {
        const px = grid.minX + gx * grid.stepX;
        const hit =
          pointInPolygonWithHoles(px, py, outer, relevantInners) ||
          pointInPolygonWithHoles(px - subDx, py - subDy, outer, relevantInners) ||
          pointInPolygonWithHoles(px + subDx, py - subDy, outer, relevantInners) ||
          pointInPolygonWithHoles(px - subDx, py + subDy, outer, relevantInners) ||
          pointInPolygonWithHoles(px + subDx, py + subDy, outer, relevantInners);
        if (hit) {
          grid.terrainFlags[gy * grid.width + gx] |= flag;
        }
      }
    }

    // Käydään myös ulkoreunan segmentit läpi, jotta kapeat lahdelmat/salmet eivät jää ruudun keskipisteiden väliin
    for (let i = 1; i < outer.length; i++) {
      const [x0, y0] = outer[i - 1];
      const [x1, y1] = outer[i];
      const dist = Math.hypot(x1 - x0, y1 - y0);
      const samples = Math.max(1, Math.ceil(dist / edgeStep));
      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        const sx = x0 + (x1 - x0) * t;
        const sy = y0 + (y1 - y0) * t;
        const gx = Math.round((sx - grid.minX) / grid.stepX);
        const gy = Math.round((sy - grid.minY) / grid.stepY);
        if (gx < 0 || gx >= grid.width || gy < 0 || gy >= grid.height) continue;
        let inHole = false;
        for (let k = 0; k < relevantInners.length; k++) {
          const inner = relevantInners[k];
          if (
            sx >= inner.minX &&
            sx <= inner.maxX &&
            sy >= inner.minY &&
            sy <= inner.maxY &&
            pointInRing(sx, sy, inner.ring)
          ) {
            inHole = true;
            break;
          }
        }
        if (!inHole) {
          grid.terrainFlags[gy * grid.width + gx] |= flag;
        }
      }
    }
  }
}

function rasterizePolyline(grid: TerrainGrid, coords: [number, number][], flag: number): void {
  const step = Math.min(grid.stepX, grid.stepY) * 0.25;
  let prevGx: number | null = null;
  let prevGy: number | null = null;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const samples = Math.max(1, Math.ceil(dist / step));
    for (let s = 0; s <= samples; s++) {
      const t = s / samples;
      const gx = Math.round((x0 + (x1 - x0) * t - grid.minX) / grid.stepX);
      const gy = Math.round((y0 + (y1 - y0) * t - grid.minY) / grid.stepY);
      if (gx >= 0 && gx < grid.width && gy >= 0 && gy < grid.height) {
        grid.terrainFlags[gy * grid.width + gx] |= flag;
      }
      if (prevGx !== null && prevGy !== null && gx !== prevGx && gy !== prevGy) {
        if (gx >= 0 && gx < grid.width && prevGy >= 0 && prevGy < grid.height) {
          grid.terrainFlags[prevGy * grid.width + gx] |= flag;
        }
      }
      prevGx = gx;
      prevGy = gy;
    }
  }
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

/**
 * Muuntaa Overpass API:n palauttamat suo- ja vesistöelementit suoraan hilabiteiksi.
 */
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

/**
 * Rasteroi valmiiksi EPSG:3857-koordinaateissa olevat vektoritiilien suo- ja vesistökohteet hilaan.
 */
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

/**
 * Muodostaa optimoidulle reitille korkeusprofiilin suoraan korkeushilasta ilman
 * erillistä verkkokyselyä.
 */
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

/**
 * Ajaa rasteroinnin, reitinhakun ja korkeusprofiilin muodostuksen valmiilla hilalla.
 */
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

  return {
    coordinates,
    geojson,
    stats,
    profile,
  };
}
