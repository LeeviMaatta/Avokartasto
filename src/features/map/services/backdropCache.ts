import TileLayer from "ol/layer/Tile";
import { get as getProjection } from "ol/proj";
import type TileSource from "ol/source/Tile";
import TileState from "ol/TileState";
import type { LocalSource } from "../../../infrastructure/tauri";
import { buildBackdropLayer } from "../../layers/domain/layerBuilder";

export const BACKDROP_MAX_ZOOM = 14;
export const DEFAULT_BACKDROP_CENTER: [number, number] = [25.7, 62.6];

const OVERVIEW_FULL_MAX_ZOOM = 3;
const FOCUSED_TILE_RADIUS = 2;
const PRELOAD_CONCURRENCY = 6;
const TILE_TIMEOUT_MS = 8000;

export interface PlannedTile {
  z: number;
  x: number;
  y: number;
}

export interface BackdropCacheStatus {
  loading: boolean;
  sourceId: string | null;
  loaded: number;
  failed: number;
  total: number;
  maxZoom: number;
  done: boolean;
}

const INITIAL_STATUS: BackdropCacheStatus = {
  loading: false,
  sourceId: null,
  loaded: 0,
  failed: 0,
  total: 0,
  maxZoom: BACKDROP_MAX_ZOOM,
  done: false,
};

let status: BackdropCacheStatus = { ...INITIAL_STATUS };
let activeController: AbortController | null = null;
let lastPreloadedKey: string | null = null;
const listeners = new Set<(next: BackdropCacheStatus) => void>();

const emitStatus = (next: BackdropCacheStatus) => {
  status = next;
  listeners.forEach((listener) => listener(status));
};

export function getBackdropCacheStatus(): BackdropCacheStatus {
  return status;
}

export function subscribeBackdropCacheStatus(listener: (next: BackdropCacheStatus) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => {
    listeners.delete(listener);
  };
}

/** Converts WGS84 coordinates into clamped Web Mercator tile indices at zoom level `z`. */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.max(0, Math.min(n - 1, Math.floor(((lon + 180) / 360) * n)));
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const rawY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const y = Math.max(0, Math.min(n - 1, Math.floor(rawY)));
  return { x, y };
}

/**
 * Plans backdrop tiles from overview zoom levels down to `BACKDROP_MAX_ZOOM` (14).
 * Higher detail levels (15+) are omitted so zooming deeper upscales cached zoom-14 tiles.
 */
export function planBackdropTiles(
  centerLonLat: [number, number],
  minZoom: number,
  maxZoom: number,
): PlannedTile[] {
  const startZoom = Math.max(0, Math.floor(minZoom));
  const endZoom = Math.min(BACKDROP_MAX_ZOOM, Math.floor(maxZoom));
  if (endZoom < startZoom) return [];

  const [lon, lat] = centerLonLat;
  const tiles: PlannedTile[] = [];

  for (let z = startZoom; z <= endZoom; z += 1) {
    const n = 2 ** z;
    const center = lonLatToTile(lon, lat, z);
    const radius = z <= OVERVIEW_FULL_MAX_ZOOM ? n : FOCUSED_TILE_RADIUS;
    const xStart = z <= OVERVIEW_FULL_MAX_ZOOM ? 0 : Math.max(0, center.x - radius);
    const xEnd = z <= OVERVIEW_FULL_MAX_ZOOM ? n - 1 : Math.min(n - 1, center.x + radius);
    const yStart = z <= OVERVIEW_FULL_MAX_ZOOM ? 0 : Math.max(0, center.y - radius);
    const yEnd = z <= OVERVIEW_FULL_MAX_ZOOM ? n - 1 : Math.min(n - 1, center.y + radius);

    const levelTiles: { z: number; x: number; y: number; dist: number }[] = [];
    for (let x = xStart; x <= xEnd; x += 1) {
      for (let y = yStart; y <= yEnd; y += 1) {
        const dx = x - center.x;
        const dy = y - center.y;
        levelTiles.push({ z, x, y, dist: dx * dx + dy * dy });
      }
    }
    levelTiles.sort((a, b) => a.dist - b.dist);
    for (const item of levelTiles) {
      tiles.push({ z: item.z, x: item.x, y: item.y });
    }
  }

  return tiles;
}

const parseCoordJson = (raw?: string): [number, number] | null => {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 2 && parsed.every((n) => typeof n === "number" && Number.isFinite(n))) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    // Ignore malformed persisted coordinates.
  }
  return null;
};

/** Resolves the best available map center `[lon, lat]` from live state or saved settings. */
export function resolveBackdropCenter(
  settings: Record<string, string>,
  liveCenter: [number, number] | null,
): [number, number] {
  return (
    liveCenter ??
    parseCoordJson(settings.initialMapCenter) ??
    parseCoordJson(settings.lastMapCenter) ??
    DEFAULT_BACKDROP_CENTER
  );
}

const preloadCacheKey = (sourceId: string, center: [number, number], maxZoom: number) =>
  `${sourceId}:${maxZoom}:${center[0].toFixed(1)},${center[1].toFixed(1)}`;

export function abortBackdropPreload() {
  if (activeController) {
    activeController.abort();
    activeController = null;
  }
  emitStatus({ ...INITIAL_STATUS });
}

async function runTileQueue<T>(
  items: T[],
  signal: AbortSignal,
  worker: (item: T) => Promise<boolean>,
  onProgress: (ok: boolean) => void,
) {
  let cursor = 0;
  const next = async () => {
    while (!signal.aborted && cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      const ok = await worker(items[idx]);
      if (!signal.aborted) onProgress(ok);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PRELOAD_CONCURRENCY, items.length) }, next));
}

function loadImageUrl(url: string, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    const onAbort = () => {
      img.src = "";
      finish(false);
    };
    const timer = window.setTimeout(() => finish(false), TILE_TIMEOUT_MS);
    signal.addEventListener("abort", onAbort, { once: true });
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

function loadOpenLayersTile(
  tileSource: TileSource,
  coord: PlannedTile,
  projection: NonNullable<ReturnType<typeof getProjection>>,
  signal: AbortSignal,
): Promise<boolean> {
  const tile = tileSource.getTile(coord.z, coord.x, coord.y, 1, projection);
  const state = tile.getState();
  if (state === TileState.LOADED || state === TileState.EMPTY) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      tile.removeEventListener("change", onChange);
      resolve(ok);
    };
    const onChange = () => {
      const nextState = tile.getState();
      if (nextState === TileState.LOADED || nextState === TileState.EMPTY) finish(true);
      else if (nextState === TileState.ERROR) finish(false);
    };
    const onAbort = () => finish(false);
    const timer = window.setTimeout(() => finish(false), TILE_TIMEOUT_MS);
    signal.addEventListener("abort", onAbort, { once: true });
    tile.addEventListener("change", onChange);
    if (tile.getState() === TileState.IDLE) tile.load();
  });
}

/**
 * Preloads backdrop tiles into the browser/OpenLayers cache for zoom levels up to `BACKDROP_MAX_ZOOM` (14).
 * When `tileSource` is omitted (e.g. immediately upon dropdown selection in Settings), builds an ephemeral
 * source to resolve the exact tile URLs and warm WebView2 HTTP cache + Rust remote-tile cache.
 */
export async function preloadBackdropLayer(options: {
  source: LocalSource;
  settings: Record<string, string>;
  centerCoord: [number, number] | null;
  tileSource?: TileSource | null;
  force?: boolean;
}) {
  const { source, settings, centerCoord, tileSource, force = false } = options;
  const center = resolveBackdropCenter(settings, centerCoord);
  const effectiveMaxZoom = Math.min(source.max_zoom || BACKDROP_MAX_ZOOM, BACKDROP_MAX_ZOOM);
  const sourceKey = `src:${source.id}`;
  const key = preloadCacheKey(sourceKey, center, effectiveMaxZoom);

  if (!force && lastPreloadedKey === key && (status.loading || status.done)) {
    return;
  }

  if (activeController) {
    activeController.abort();
  }
  const controller = new AbortController();
  activeController = controller;

  const projection = getProjection("EPSG:3857");
  if (!projection) return;

  const resolvedTileSource = (() => {
    if (tileSource) return tileSource;
    const ephemeral = buildBackdropLayer(sourceKey, settings, [source], BACKDROP_MAX_ZOOM);
    return ephemeral instanceof TileLayer ? ephemeral.getSource() : null;
  })();

  if (!resolvedTileSource || !("getTileUrlFunction" in resolvedTileSource)) {
    emitStatus({
      loading: false,
      sourceId: sourceKey,
      loaded: 0,
      failed: 0,
      total: 0,
      maxZoom: effectiveMaxZoom,
      done: true,
    });
    return;
  }

  const minZoom = Math.max(0, source.min_zoom || 0);
  const planned = planBackdropTiles(center, minZoom, effectiveMaxZoom);
  const urlFn = resolvedTileSource.getTileUrlFunction();
  const urlItems = tileSource
    ? []
    : planned
        .map((coord) => urlFn([coord.z, coord.x, coord.y], 1, projection))
        .filter((url): url is string => Boolean(url));

  const total = tileSource ? planned.length : urlItems.length;
  if (total === 0) {
    emitStatus({
      loading: false,
      sourceId: sourceKey,
      loaded: 0,
      failed: 0,
      total: 0,
      maxZoom: effectiveMaxZoom,
      done: true,
    });
    return;
  }

  lastPreloadedKey = key;
  let loaded = 0;
  let failed = 0;
  const publishProgress = (loading: boolean, done: boolean) => {
    emitStatus({
      loading,
      sourceId: sourceKey,
      loaded,
      failed,
      total,
      maxZoom: effectiveMaxZoom,
      done,
    });
  };
  const onProgress = (ok: boolean) => {
    if (ok) loaded += 1;
    else failed += 1;
    publishProgress(true, false);
  };

  publishProgress(true, false);

  if (tileSource) {
    await runTileQueue(
      planned,
      controller.signal,
      (coord) => loadOpenLayersTile(tileSource, coord, projection, controller.signal),
      onProgress,
    );
  } else {
    await runTileQueue(
      urlItems,
      controller.signal,
      (url) => loadImageUrl(url, controller.signal),
      onProgress,
    );
  }

  if (controller.signal.aborted) return;
  if (activeController === controller) {
    activeController = null;
  }
  publishProgress(false, true);
}
