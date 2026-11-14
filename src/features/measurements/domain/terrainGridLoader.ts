import Feature from "ol/Feature";
import MVT from "ol/format/MVT";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import { toLonLat } from "ol/proj";
import { inTauri } from "../../../infrastructure/tauri/runtime";
import {
  terrainFetchBinaryBackend,
  terrainOverpassQueryBackend,
} from "../../../infrastructure/tauri/terrainBridge";
import { fetchWithDebug } from "../../debug/debugFetch";
import { recordDebugEvent, setNetworkRequestActive } from "../../debug/debugMonitor";
import {
  TERRAIN_WATER,
  type TerrainRouteOptions,
  type TerrainRouteStats,
} from "./terrainRouting";
import {
  classifyWetlandFlags,
  executeTerrainRouteCompute,
  rasterizeOverpassElementsToGrid,
  rasterizeVectorObstaclesToGrid,
  type OverpassElement,
  type TerrainComputeInput,
  type TerrainComputeOutput,
  type TerrainProfilePoint,
  type VectorObstaclePolygon,
  type VectorObstaclePolyline,
} from "./terrainCompute";
import type { TerrainWorkerRequest, TerrainWorkerResponse } from "./terrainWorker";

export {
  classifyWetlandFlags,
  rasterizeOverpassElementsToGrid,
  rasterizeVectorObstaclesToGrid,
  type OverpassElement,
};

const EARTH_HALF_CIRC = 20037508.342789244;
const TILE_SIZE = 256;
const MAX_TILES_PER_REQUEST = 16;
const MAX_GRID_DIM = 150;
const MAX_ROUTE_SPAN_M = 40_000;
const MIN_CELL_M = 12;
const DEM_CACHE_LIMIT = 64;
const VECTOR_TILE_CACHE_LIMIT = 96;
const OVERPASS_CACHE_LIMIT = 24;
const OVERPASS_CLIENT_TIMEOUT_MS = 10_000;
const VECTOR_TILE_TIMEOUT_MS = 6_000;
const OPENFREEMAP_TILEJSON_URL = "https://tiles.openfreemap.org/planet";
const OPENFREEMAP_TILEJSON_TTL_MS = 30 * 60_000;

const TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const WETLAND_SUBCLASSES = new Set([
  "wetland",
  "bog",
  "marsh",
  "swamp",
  "fen",
  "reedbed",
  "wet_meadow",
  "tidalflat",
  "mangrove",
  "string_bog",
  "palsa_bog",
  "saltmarsh",
  "mud",
  "quagmire",
]);

interface CachedOverpassEntry {
  west: number;
  south: number;
  east: number;
  north: number;
  hasSwamp: boolean;
  hasWater: boolean;
  hasStreams: boolean;
  elements: OverpassElement[];
}

interface DecodedVectorTile {
  polygons: VectorObstaclePolygon[];
  polylines: VectorObstaclePolyline[];
}

interface VectorTileTemplateCache {
  template: string;
  maxZoom: number;
  expiresAt: number;
}

const demTileCache = new Map<string, Float32Array>();
const vectorTileCache = new Map<string, DecodedVectorTile>();
const overpassCache: CachedOverpassEntry[] = [];
let vectorTemplateCache: VectorTileTemplateCache | null = null;
const mvtParser = new MVT({ featureClass: Feature });

export interface TerrainGridSpec {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  stepX: number;
  stepY: number;
  metersPerUnit: number;
  tileZoom: number;
}

export interface TerrainOptimizationOutput {
  coordinates: [number, number][];
  geojson: string;
  stats: TerrainRouteStats;
  profile: TerrainProfilePoint[];
  warnings: string[];
}

export interface OptimizeTerrainRouteCallbacks {
  onStage?: (stageLabel: string) => void;
}

export function decodeTerrariumRgb(r: number, g: number, b: number): number {
  const elev = r * 256 + g + b / 256 - 32768;
  return elev < -500 ? 0 : elev;
}

export function mercatorToTileCoords(x: number, y: number, zoom: number): {
  tileX: number;
  tileY: number;
  pixelX: number;
  pixelY: number;
} {
  const numTiles = 1 << zoom;
  const maxTile = numTiles - 1;
  const normX = Math.max(0, Math.min(0.9999999, (x + EARTH_HALF_CIRC) / (2 * EARTH_HALF_CIRC)));
  const normY = Math.max(0, Math.min(0.9999999, (EARTH_HALF_CIRC - y) / (2 * EARTH_HALF_CIRC)));
  const fx = normX * numTiles;
  const fy = normY * numTiles;
  const tileX = Math.min(maxTile, Math.max(0, Math.floor(fx)));
  const tileY = Math.min(maxTile, Math.max(0, Math.floor(fy)));
  const pixelX = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor((fx - tileX) * TILE_SIZE)));
  const pixelY = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor((fy - tileY) * TILE_SIZE)));
  return { tileX, tileY, pixelX, pixelY };
}

export function computeTerrainGridSpec(waypointsMercator: [number, number][]): TerrainGridSpec {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of waypointsMercator) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const centerY = (minY + maxY) * 0.5;
  const [, centerLat] = toLonLat([0, centerY]);
  const metersPerUnit = Math.max(0.2, Math.cos((centerLat * Math.PI) / 180));

  const spanUnits = Math.max(maxX - minX, maxY - minY);
  const spanM = spanUnits * metersPerUnit;
  if (spanM > MAX_ROUTE_SPAN_M) {
    throw new Error("Maastoreititys tukee enintään 40 km pituisia mittauksia kerralla.");
  }

  const paddingM = Math.min(3000, Math.max(500, spanM * 0.3));
  const paddingUnits = paddingM / metersPerUnit;
  const paddedMinX = minX - paddingUnits;
  const paddedMaxX = maxX + paddingUnits;
  const paddedMinY = minY - paddingUnits;
  const paddedMaxY = maxY + paddingUnits;

  const boxWidthUnits = Math.max(100, paddedMaxX - paddedMinX);
  const boxHeightUnits = Math.max(100, paddedMaxY - paddedMinY);
  const boxWidthM = boxWidthUnits * metersPerUnit;
  const boxHeightM = boxHeightUnits * metersPerUnit;

  const targetCellM = Math.max(MIN_CELL_M, Math.ceil(Math.max(boxWidthM, boxHeightM) / MAX_GRID_DIM));
  const cellUnits = targetCellM / metersPerUnit;
  const width = Math.max(8, Math.min(MAX_GRID_DIM, Math.ceil(boxWidthUnits / cellUnits) + 1));
  const height = Math.max(8, Math.min(MAX_GRID_DIM, Math.ceil(boxHeightUnits / cellUnits) + 1));
  const stepX = boxWidthUnits / (width - 1);
  const stepY = boxHeightUnits / (height - 1);

  // Valitaan pienin zoom (10..14), jonka pikselitarkkuus riittää solukoolle ja tiilimäärä pysyy pienenä
  let chosenZoom = 10;
  let maxFittingZoom = 10;
  for (let z = 14; z >= 10; z--) {
    const tl = mercatorToTileCoords(paddedMinX, paddedMaxY, z);
    const br = mercatorToTileCoords(paddedMaxX, paddedMinY, z);
    const count = (br.tileX - tl.tileX + 1) * (br.tileY - tl.tileY + 1);
    if (count <= MAX_TILES_PER_REQUEST) {
      maxFittingZoom = z;
      break;
    }
  }
  chosenZoom = maxFittingZoom;
  for (let z = 10; z <= maxFittingZoom; z++) {
    const pixelMeters = ((2 * EARTH_HALF_CIRC) / (TILE_SIZE * (1 << z))) * metersPerUnit;
    if (pixelMeters <= targetCellM * 0.95) {
      chosenZoom = z;
      break;
    }
  }

  return {
    minX: paddedMinX,
    minY: paddedMinY,
    maxX: paddedMaxX,
    maxY: paddedMaxY,
    width,
    height,
    stepX,
    stepY,
    metersPerUnit,
    tileZoom: chosenZoom,
  };
}

function setBoundedCache<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  if (map.size >= limit) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

async function decodePngTileToElevations(blob: Blob): Promise<Float32Array> {
  const bitmap = await createImageBitmap(blob);
  try {
    let imageData: ImageData;
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas-kontekstia ei voitu luoda");
      ctx.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
      imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas-kontekstia ei voitu luoda");
      ctx.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE);
      imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
    }

    const elevations = new Float32Array(TILE_SIZE * TILE_SIZE);
    const data = imageData.data;
    for (let i = 0, p = 0; i < elevations.length; i++, p += 4) {
      elevations[i] = decodeTerrariumRgb(data[p], data[p + 1], data[p + 2]);
    }
    return elevations;
  } finally {
    bitmap.close();
  }
}

async function loadTerrariumTile(
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal,
): Promise<Float32Array> {
  const key = `${z}/${x}/${y}`;
  const cached = demTileCache.get(key);
  if (cached) return cached;

  const url = TERRARIUM_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
  const res = await fetchWithDebug(url, { signal }, "terrain-dem");
  if (!res.ok) {
    throw new Error(`Korkeusmallitiilen lataus epäonnistui (HTTP ${res.status})`);
  }
  const blob = await res.blob();
  const elevations = await decodePngTileToElevations(blob);
  setBoundedCache(demTileCache, key, elevations, DEM_CACHE_LIMIT);
  return elevations;
}

async function populateElevationGrid(
  spec: TerrainGridSpec,
  signal?: AbortSignal,
): Promise<Float32Array> {
  const z = spec.tileZoom;
  const tl = mercatorToTileCoords(spec.minX, spec.maxY, z);
  const br = mercatorToTileCoords(spec.minX + (spec.width - 1) * spec.stepX, spec.minY, z);

  const tiles = new Map<string, Float32Array>();
  const jobs: Promise<void>[] = [];
  for (let tx = tl.tileX; tx <= br.tileX; tx++) {
    for (let ty = tl.tileY; ty <= br.tileY; ty++) {
      jobs.push(
        loadTerrariumTile(z, tx, ty, signal).then((arr) => {
          tiles.set(`${tx}/${ty}`, arr);
        }),
      );
    }
  }
  await Promise.all(jobs);

  const elevations = new Float32Array(spec.width * spec.height);
  for (let gy = 0; gy < spec.height; gy++) {
    const y = spec.minY + gy * spec.stepY;
    for (let gx = 0; gx < spec.width; gx++) {
      const x = spec.minX + gx * spec.stepX;
      const { tileX, tileY, pixelX, pixelY } = mercatorToTileCoords(x, y, z);
      const tile = tiles.get(`${tileX}/${tileY}`);
      elevations[gy * spec.width + gx] = tile ? tile[pixelY * TILE_SIZE + pixelX] : 0;
    }
  }
  return elevations;
}

function runWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Maastoreititys peruutettu", "AbortError"));
  }
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Maastoreititys peruutettu", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

async function fetchBinaryWithBackendOrFetch(
  url: string,
  service: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  if (inTauri()) {
    setNetworkRequestActive(true);
    try {
      const bytes = await runWithAbort(terrainFetchBinaryBackend(url), signal);
      setNetworkRequestActive(false, false);
      return new Uint8Array(bytes).buffer;
    } catch (err) {
      setNetworkRequestActive(false, true);
      if (!signal?.aborted) {
        recordDebugEvent("network", `${service}: backend fetch failed`, "warning");
      }
      throw err;
    }
  }
  const res = await fetchWithDebug(url, { signal }, service);
  if (!res.ok) {
    throw new Error(`${service} HTTP ${res.status}`);
  }
  return await res.arrayBuffer();
}

function tileExtent3857(z: number, x: number, y: number): [number, number, number, number] {
  const worldSize = EARTH_HALF_CIRC * 2;
  const tileSpan = worldSize / (1 << z);
  const minX = -EARTH_HALF_CIRC + x * tileSpan;
  const maxX = minX + tileSpan;
  const maxY = EARTH_HALF_CIRC - y * tileSpan;
  const minY = maxY - tileSpan;
  return [minX, minY, maxX, maxY];
}

async function resolveOpenFreeMapTemplate(signal?: AbortSignal): Promise<{ template: string; maxZoom: number }> {
  if (vectorTemplateCache && vectorTemplateCache.expiresAt > Date.now()) {
    return { template: vectorTemplateCache.template, maxZoom: vectorTemplateCache.maxZoom };
  }
  const buf = await fetchBinaryWithBackendOrFetch(OPENFREEMAP_TILEJSON_URL, "terrain-vector-meta", signal);
  const text = new TextDecoder().decode(buf);
  const tj = JSON.parse(text) as { tiles?: string[]; maxzoom?: number };
  const template = Array.isArray(tj.tiles) && typeof tj.tiles[0] === "string" ? tj.tiles[0] : "";
  if (!template) {
    throw new Error("Vektoritiilien osoitepohja puuttuu");
  }
  const maxZoom = typeof tj.maxzoom === "number" ? tj.maxzoom : 14;
  vectorTemplateCache = {
    template,
    maxZoom,
    expiresAt: Date.now() + OPENFREEMAP_TILEJSON_TTL_MS,
  };
  return { template, maxZoom };
}

export function decodeMvtVectorTile(
  buf: ArrayBuffer,
  z: number,
  x: number,
  y: number,
): DecodedVectorTile {
  const polygons: VectorObstaclePolygon[] = [];
  const polylines: VectorObstaclePolyline[] = [];
  if (buf.byteLength === 0) return { polygons, polylines };

  const features = mvtParser.readFeatures(buf, {
    extent: tileExtent3857(z, x, y),
    featureProjection: "EPSG:3857",
  });

  for (let i = 0; i < features.length; i++) {
    const feat = features[i];
    const props = feat.getProperties() as Record<string, unknown>;
    const layer = typeof props.layer === "string" ? props.layer : "";
    const cls = typeof props.class === "string" ? props.class : "";
    const sub = typeof props.subclass === "string" ? props.subclass : "";

    let flag = 0;
    let isStream = false;
    if (layer === "landcover") {
      if (cls === "wetland" || WETLAND_SUBCLASSES.has(sub)) {
        flag = classifyWetlandFlags(sub);
      }
    } else if (layer === "water") {
      if (cls !== "swimming_pool") {
        flag = TERRAIN_WATER;
      }
    } else if (layer === "waterway") {
      if (cls === "river" || cls === "canal") {
        flag = TERRAIN_WATER;
      } else if (cls === "stream" || cls === "drain" || cls === "ditch") {
        flag = TERRAIN_WATER;
        isStream = true;
      }
    }
    if (flag === 0) continue;

    const geom = feat.getGeometry();
    if (!geom) continue;
    const geomType = geom.getType();
    if (geomType === "Polygon") {
      const rings = (geom as unknown as { getCoordinates(): [number, number][][] }).getCoordinates();
      if (rings.length > 0) polygons.push({ flag, rings });
    } else if (geomType === "MultiPolygon") {
      const polys = (geom as unknown as { getCoordinates(): [number, number][][][] }).getCoordinates();
      for (const rings of polys) {
        if (rings.length > 0) polygons.push({ flag, rings });
      }
    } else if (geomType === "LineString") {
      const coords = (geom as unknown as { getCoordinates(): [number, number][] }).getCoordinates();
      if (coords.length >= 2) polylines.push({ flag, isStream, coords });
    } else if (geomType === "MultiLineString") {
      const lines = (geom as unknown as { getCoordinates(): [number, number][][] }).getCoordinates();
      for (const coords of lines) {
        if (coords.length >= 2) polylines.push({ flag, isStream, coords });
      }
    }
  }
  return { polygons, polylines };
}

async function fetchVectorTileObstacles(
  spec: TerrainGridSpec,
  signal?: AbortSignal,
): Promise<DecodedVectorTile> {
  const controller = new AbortController();
  const timerId = globalThis.setTimeout(() => controller.abort(), VECTOR_TILE_TIMEOUT_MS);
  const onParentAbort = () => controller.abort();
  signal?.addEventListener("abort", onParentAbort, { once: true });

  try {
    const { template, maxZoom } = await resolveOpenFreeMapTemplate(controller.signal);
    const maxZ = Math.min(14, maxZoom);
    let chosenZ = Math.min(12, maxZ);
    for (let z = maxZ; z >= 12; z--) {
      const tl = mercatorToTileCoords(spec.minX, spec.maxY, z);
      const br = mercatorToTileCoords(spec.maxX, spec.minY, z);
      const count = (br.tileX - tl.tileX + 1) * (br.tileY - tl.tileY + 1);
      if (count <= MAX_TILES_PER_REQUEST) {
        chosenZ = z;
        break;
      }
    }

    const tl = mercatorToTileCoords(spec.minX, spec.maxY, chosenZ);
    const br = mercatorToTileCoords(spec.maxX, spec.minY, chosenZ);

    const tileJobs: Promise<DecodedVectorTile>[] = [];
    for (let tx = tl.tileX; tx <= br.tileX; tx++) {
      for (let ty = tl.tileY; ty <= br.tileY; ty++) {
        const key = `${chosenZ}/${tx}/${ty}`;
        const cached = vectorTileCache.get(key);
        if (cached) {
          tileJobs.push(Promise.resolve(cached));
        } else {
          const url = template
            .replace("{z}", String(chosenZ))
            .replace("{x}", String(tx))
            .replace("{y}", String(ty));
          tileJobs.push(
            fetchBinaryWithBackendOrFetch(url, "terrain-vector-tile", controller.signal)
              .then((buf) => {
                const decoded = decodeMvtVectorTile(buf, chosenZ, tx, ty);
                setBoundedCache(vectorTileCache, key, decoded, VECTOR_TILE_CACHE_LIMIT);
                return decoded;
              }),
          );
        }
      }
    }

    const decodedTiles = await Promise.all(tileJobs);
    const polygons: VectorObstaclePolygon[] = [];
    const polylines: VectorObstaclePolyline[] = [];
    for (const tile of decodedTiles) {
      polygons.push(...tile.polygons);
      polylines.push(...tile.polylines);
    }
    return { polygons, polylines };
  } finally {
    globalThis.clearTimeout(timerId);
    signal?.removeEventListener("abort", onParentAbort);
  }
}

function findCachedOverpassObstacles(
  west: number,
  south: number,
  east: number,
  north: number,
  needSwamp: boolean,
  needWater: boolean,
  needStreams: boolean,
): OverpassElement[] | null {
  for (let i = overpassCache.length - 1; i >= 0; i--) {
    const entry = overpassCache[i];
    if (
      entry.west <= west &&
      entry.south <= south &&
      entry.east >= east &&
      entry.north >= north &&
      (!needSwamp || entry.hasSwamp) &&
      (!needWater || entry.hasWater) &&
      (!needStreams || entry.hasStreams)
    ) {
      return entry.elements;
    }
  }
  return null;
}

function storeCachedOverpassObstacles(entry: CachedOverpassEntry): void {
  if (overpassCache.length >= OVERPASS_CACHE_LIMIT) {
    overpassCache.shift();
  }
  overpassCache.push(entry);
}

function buildOverpassQuery(
  bbox: string,
  needSwamp: boolean,
  needWater: boolean,
  needStreams: boolean,
): string {
  const parts: string[] = [];
  if (needSwamp) {
    parts.push(
      `way["natural"="wetland"](${bbox});`,
      `relation["natural"="wetland"](${bbox});`,
    );
  }
  if (needWater) {
    parts.push(
      `way["natural"="water"](${bbox});`,
      `relation["natural"="water"](${bbox});`,
      `way["waterway"~"^(river|canal|riverbank)$"](${bbox});`,
      `relation["waterway"="riverbank"](${bbox});`,
    );
    if (needStreams) {
      parts.push(`way["waterway"="stream"](${bbox});`);
    }
  }
  return `[out:json][timeout:10][maxsize:33554432];(${parts.join("")});out geom;`;
}

function raceFirstSuccess<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let remaining = promises.length;
    if (remaining === 0) {
      reject(new Error("Ei hakupyyntöjä"));
      return;
    }
    let lastError: unknown;
    for (const promise of promises) {
      promise.then(resolve, (err) => {
        lastError = err;
        remaining -= 1;
        if (remaining === 0) {
          reject(lastError instanceof Error ? lastError : new Error(String(lastError)));
        }
      });
    }
  });
}

async function fetchOverpassObstacles(
  spec: TerrainGridSpec,
  needSwamp: boolean,
  needWater: boolean,
  needStreams: boolean,
  signal?: AbortSignal,
): Promise<OverpassElement[]> {
  if (!needSwamp && !needWater) return [];

  const [west, south] = toLonLat([spec.minX, spec.minY]);
  const [east, north] = toLonLat([spec.maxX, spec.maxY]);
  const cached = findCachedOverpassObstacles(west, south, east, north, needSwamp, needWater, needStreams);
  if (cached) return cached;

  // Laajennetaan hakualuetta hieman (~0.004°), jotta pienten pisteiden siirrot osuvat välimuistiin
  const qWest = west - 0.004;
  const qSouth = south - 0.004;
  const qEast = east + 0.004;
  const qNorth = north + 0.004;
  const bbox = `${qSouth.toFixed(5)},${qWest.toFixed(5)},${qNorth.toFixed(5)},${qEast.toFixed(5)}`;
  const query = buildOverpassQuery(bbox, needSwamp, needWater, needStreams);

  if (inTauri()) {
    setNetworkRequestActive(true);
    try {
      const raw = await runWithAbort(terrainOverpassQueryBackend(query), signal);
      setNetworkRequestActive(false, false);
      const data = JSON.parse(raw) as { elements?: OverpassElement[] };
      const elements = Array.isArray(data.elements) ? data.elements : [];
      storeCachedOverpassObstacles({
        west: qWest,
        south: qSouth,
        east: qEast,
        north: qNorth,
        hasSwamp: needSwamp,
        hasWater: needWater,
        hasStreams: needWater && needStreams,
        elements,
      });
      return elements;
    } catch (err) {
      setNetworkRequestActive(false, true);
      if (!signal?.aborted) {
        recordDebugEvent("network", "terrain-obstacles: overpass failed", "warning");
      }
      throw err instanceof Error ? err : new Error("Maastoesteiden haku epäonnistui");
    }
  }

  const raceController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => raceController.abort(), OVERPASS_CLIENT_TIMEOUT_MS);
  const onParentAbort = () => raceController.abort();
  signal?.addEventListener("abort", onParentAbort, { once: true });

  try {
    const body = `data=${encodeURIComponent(query)}`;
    const attempts = OVERPASS_ENDPOINTS.map(async (endpoint) => {
      const res = await fetchWithDebug(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
          body,
          signal: raceController.signal,
        },
        "terrain-obstacles",
      );
      if (!res.ok) {
        throw new Error(`Overpass HTTP ${res.status}`);
      }
      const data = (await res.json()) as { elements?: OverpassElement[] };
      return Array.isArray(data.elements) ? data.elements : [];
    });

    const elements = await raceFirstSuccess(attempts);
    raceController.abort();
    storeCachedOverpassObstacles({
      west: qWest,
      south: qSouth,
      east: qEast,
      north: qNorth,
      hasSwamp: needSwamp,
      hasWater: needWater,
      hasStreams: needWater && needStreams,
      elements,
    });
    return elements;
  } catch (err) {
    if (signal?.aborted) {
      throw new DOMException("Maastoreititys peruutettu", "AbortError");
    }
    throw err instanceof Error ? err : new Error("Maastoesteiden haku epäonnistui");
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onParentAbort);
  }
}

let workerInstance: Worker | null = null;
let workerReqSeq = 0;

async function runTerrainComputeOffMainThread(
  input: TerrainComputeInput,
  signal?: AbortSignal,
): Promise<TerrainComputeOutput> {
  if (typeof Worker === "undefined") {
    return executeTerrainRouteCompute(input);
  }

  let worker: Worker;
  try {
    if (!workerInstance) {
      workerInstance = new Worker(new URL("./terrainWorker.ts", import.meta.url), {
        type: "module",
      });
    }
    worker = workerInstance;
  } catch {
    return executeTerrainRouteCompute(input);
  }

  return await new Promise<TerrainComputeOutput>((resolve, reject) => {
    const reqId = ++workerReqSeq;
    // Kopioidaan siirrettäväksi puskuriksi Workerille, jolloin pääsäikeen viite pysyy puhtaana
    const elevCopy = new Float32Array(input.elevations);
    const payload: TerrainComputeInput = { ...input, elevations: elevCopy };

    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      worker.terminate();
      if (workerInstance === worker) workerInstance = null;
      reject(new DOMException("Maastoreititys peruutettu", "AbortError"));
    };

    const onMessage = (event: MessageEvent<TerrainWorkerResponse>) => {
      if (event.data.id !== reqId) return;
      cleanup();
      if (event.data.error) {
        reject(new Error(event.data.error));
      } else if (event.data.result) {
        resolve(event.data.result);
      } else {
        reject(new Error("Tyhjä vastaus reitityslaskennasta"));
      }
    };

    const onError = () => {
      cleanup();
      worker.terminate();
      if (workerInstance === worker) workerInstance = null;
      try {
        resolve(executeTerrainRouteCompute(input));
      } catch (err) {
        reject(err);
      }
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });

    const request: TerrainWorkerRequest = { id: reqId, payload };
    worker.postMessage(request, [elevCopy.buffer]);
  });
}

/**
 * Hakee mittausalueen korkeusmallin ja suo-/vesistöesteet sekä optimoi
 * etäisyysmittauksen maastoreitiksi.
 */
export async function optimizeDistanceMeasurementToTerrainRoute(
  geojsonString: string,
  options: TerrainRouteOptions = {},
  signal?: AbortSignal,
  callbacks?: OptimizeTerrainRouteCallbacks,
): Promise<TerrainOptimizationOutput> {
  const geom = new GeoJSON().readGeometry(JSON.parse(geojsonString), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });
  if (!(geom instanceof LineString)) {
    throw new Error("Maastoreititys toimii vain etäisyysmittauksille (viiva).");
  }
  const waypointsMercator = geom.getCoordinates() as [number, number][];
  if (waypointsMercator.length < 2) {
    throw new Error("Mittauksessa on oltava vähintään kaksi pistettä.");
  }

  const spec = computeTerrainGridSpec(waypointsMercator);
  const avoidSwamp = options.avoidSwamp ?? true;
  const avoidWater = options.avoidWater ?? true;
  const avoidStreams = options.avoidStreams ?? false;
  const warnings: string[] = [];

  callbacks?.onStage?.("Haetaan maasto- ja korkeustietoja...");

  const elevationsPromise = populateElevationGrid(spec, signal);
  const obstaclesPromise: Promise<{
    overpass: OverpassElement[];
    vector: DecodedVectorTile;
  }> =
    avoidSwamp || avoidWater
      ? fetchVectorTileObstacles(spec, signal)
          .then((vector) => ({ overpass: [] as OverpassElement[], vector }))
          .catch(async (vectorErr) => {
            if (signal?.aborted) throw vectorErr;
            // Jos CDN-vektoritiilet epäonnistuvat, kokeillaan Overpass-varalähdettä Tauri-taustapalvelun kautta
            try {
              const overpass = await fetchOverpassObstacles(
                spec,
                avoidSwamp,
                avoidWater,
                avoidStreams,
                signal,
              );
              return {
                overpass,
                vector: { polygons: [], polylines: [] },
              };
            } catch (overpassErr) {
              if (signal?.aborted) throw overpassErr;
              warnings.push("Suo- tai vesistötietoja ei voitu hakea (reititettiin korkeusmallilla).");
              return {
                overpass: [],
                vector: { polygons: [], polylines: [] },
              };
            }
          })
      : Promise.resolve({
          overpass: [],
          vector: { polygons: [], polylines: [] },
        });

  const [elevations, loadedObstacles] = await Promise.all([elevationsPromise, obstaclesPromise]);
  if (signal?.aborted) {
    throw new DOMException("Maastoreititys peruutettu", "AbortError");
  }

  callbacks?.onStage?.("Lasketaan reittiä...");

  const computeResult = await runTerrainComputeOffMainThread(
    {
      width: spec.width,
      height: spec.height,
      minX: spec.minX,
      minY: spec.minY,
      stepX: spec.stepX,
      stepY: spec.stepY,
      metersPerUnit: spec.metersPerUnit,
      elevations,
      waypointsMercator,
      obstacles: loadedObstacles.overpass,
      vectorPolygons: loadedObstacles.vector.polygons,
      vectorPolylines: loadedObstacles.vector.polylines,
      options,
    },
    signal,
  );

  return {
    ...computeResult,
    warnings,
  };
}
