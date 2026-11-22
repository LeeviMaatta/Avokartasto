import { toLonLat } from "ol/proj";
import { runWithAbort } from "../../../../shared/async/abort";
import { inTauri } from "../../../../infrastructure/tauri/runtime";
import { terrainFetchBinaryBackend } from "../../../../infrastructure/tauri/terrainBridge";
import { fetchWithDebug } from "../../../debug/services/debugFetch";
import { recordDebugEvent, setNetworkRequestActive } from "../../../debug/services/debugMonitor";

export const EARTH_HALF_CIRC = 20037508.342789244;
export const TILE_SIZE = 256;
export const MAX_TILES_PER_REQUEST = 16;
const MAX_GRID_DIM = 150;
const MAX_ROUTE_SPAN_M = 40_000;
const MIN_CELL_M = 12;
const DEM_CACHE_LIMIT = 64;
const TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

const demTileCache = new Map<string, Float32Array>();

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

export function setBoundedCache<K, V>(map: Map<K, V>, key: K, value: V, limit: number): void {
  if (map.size >= limit) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
}

export function tileExtent3857(z: number, x: number, y: number): [number, number, number, number] {
  const worldSize = EARTH_HALF_CIRC * 2;
  const tileSpan = worldSize / (1 << z);
  const minX = -EARTH_HALF_CIRC + x * tileSpan;
  const maxX = minX + tileSpan;
  const maxY = EARTH_HALF_CIRC - y * tileSpan;
  const minY = maxY - tileSpan;
  return [minX, minY, maxX, maxY];
}

export async function fetchBinaryWithBackendOrFetch(
  url: string,
  service: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  if (inTauri()) {
    setNetworkRequestActive(true);
    try {
      const bytes = await runWithAbort(terrainFetchBinaryBackend(url), signal, "Maastoreititys peruutettu");
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
  let chosenZoom = maxFittingZoom;
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

export async function populateElevationGrid(
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
