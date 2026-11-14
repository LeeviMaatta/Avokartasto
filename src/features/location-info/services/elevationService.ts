const BASE = "https://api.open-meteo.com/v1/elevation";
const BATCH_SIZE = 100;
const MAX_CACHE_ENTRIES = 1024;
const CACHE_TTL_MS = 30 * 60_000;
const DEFAULT_PAUSE_MS = 60_000;
const MAX_PAUSE_MS = 60 * 60_000;
const cache = new Map<string, { value: number | null | (number | null)[]; expires: number }>();
const inFlightSingle = new Map<string, Promise<number | null>>();
const inFlightBatch = new Map<string, Promise<(number | null)[]>>();
let pausedUntil = 0;
import { fetchWithDebug } from "../../debug/services/debugFetch";

const coordKey = (lat: number, lon: number) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

const parseRetryAfterMs = (headerValue: string | null): number | null => {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(Math.max(Math.ceil(seconds * 1000), 1000), MAX_PAUSE_MS);
  }
  const targetMs = Date.parse(trimmed);
  if (Number.isFinite(targetMs)) {
    const delta = targetMs - Date.now();
    if (delta > 0) return Math.min(Math.max(delta, 1000), MAX_PAUSE_MS);
  }
  return null;
};

const assertNotPaused = () => {
  const remaining = pausedUntil - Date.now();
  if (remaining > 0) {
    throw new Error(`Open-Meteo Elevation tauolla (${Math.ceil(remaining / 1000)} s)`);
  }
};

const handleErrorResponse = (response: Response) => {
  const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
  if (retryAfterMs !== null) {
    pausedUntil = Math.max(pausedUntil, Date.now() + retryAfterMs);
  } else if (response.status === 429) {
    pausedUntil = Math.max(pausedUntil, Date.now() + DEFAULT_PAUSE_MS);
  }
};

const setCacheEntry = (key: string, value: number | null | (number | null)[]) => {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
};

const parseElevation = (value: unknown): number | null => {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Korkeuspalvelun vastaus sisälsi virheellisen korkeusarvon");
  }
  return value;
};

const fetchElevationBatch = async (points: [number, number][]): Promise<(number | null)[]> => {
  assertNotPaused();
  const lats = points.map(([, lat]) => lat).join(",");
  const lons = points.map(([lon]) => lon).join(",");
  const response = await fetchWithDebug(`${BASE}?latitude=${lats}&longitude=${lons}`, undefined, "elevation");
  if (response.ok) {
    const json: unknown = await response.json();
    if (json && typeof json === "object" && "elevation" in json && Array.isArray(json.elevation)) {
      const values = json.elevation.map((value: unknown) => parseElevation(value));
      if (values.length !== points.length) {
        throw new Error("Korkeuspalvelu palautti väärän määrän arvoja");
      }
      return values;
    }
    throw new Error("Korkeuspalvelun vastaus oli virheellisessä muodossa");
  }
  handleErrorResponse(response);
  throw new Error(`Open-Meteo Elevation: ${response.status}`);
};

export async function elevationAt(lat: number, lon: number, signal?: AbortSignal): Promise<number | null> {
  const key = coordKey(lat, lon);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now() && !Array.isArray(hit.value)) return hit.value;
  assertNotPaused();

  const existing = inFlightSingle.get(key);
  if (existing) return existing;

  const qLat = Number(lat.toFixed(3));
  const qLon = Number(lon.toFixed(3));
  const promise = (async () => {
    const r = await fetchWithDebug(`${BASE}?latitude=${qLat}&longitude=${qLon}`, { signal }, "elevation");
    if (!r.ok) {
      handleErrorResponse(r);
      throw new Error(`Open-Meteo Elevation: ${r.status}`);
    }
    const j: unknown = await r.json();
    if (!j || typeof j !== "object" || !("elevation" in j)) {
      throw new Error("Korkeuspalvelun vastaus oli virheellisessä muodossa");
    }
    const raw = (j as { elevation: unknown }).elevation;
    const value = Array.isArray(raw) ? parseElevation(raw[0] ?? null) : parseElevation(raw);
    setCacheEntry(key, value);
    return value;
  })().finally(() => {
    inFlightSingle.delete(key);
  });

  inFlightSingle.set(key, promise);
  return promise;
}

export async function elevationBatch(points: [number, number][]): Promise<(number | null)[]> {
  if (points.length === 0) return [];
  const key = points.map(([lon, lat]) => coordKey(lat, lon)).join("|");
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now() && Array.isArray(hit.value)) return hit.value;
  assertNotPaused();

  const existing = inFlightBatch.get(key);
  if (existing) return existing;

  const roundedPoints: [number, number][] = points.map(([lon, lat]) => [Number(lon.toFixed(3)), Number(lat.toFixed(3))]);
  const promise = (async () => {
    const values: (number | null)[] = [];
    for (let start = 0; start < roundedPoints.length; start += BATCH_SIZE) {
      values.push(...await fetchElevationBatch(roundedPoints.slice(start, start + BATCH_SIZE)));
    }
    setCacheEntry(key, values);
    roundedPoints.forEach(([lon, lat], idx) => {
      setCacheEntry(coordKey(lat, lon), values[idx] ?? null);
    });
    return values;
  })().finally(() => {
    inFlightBatch.delete(key);
  });

  inFlightBatch.set(key, promise);
  return promise;
}