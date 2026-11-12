const BASE = "https://api.open-meteo.com/v1/elevation";
const BATCH_SIZE = 7;
const MAX_RETRIES = 2;
const cache = new Map<string, { value: number | null | (number | null)[]; expires: number }>();
import { fetchWithDebug } from "../debug/debugFetch";

const parseElevation = (value: unknown): number | null => {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Korkeuspalvelun vastaus sisälsi virheellisen korkeusarvon");
  }
  return value;
};

const retryDelay = (response: Response, attempt: number) => {
  const retryAfter = Number(response.headers.get("retry-after"));
  return Number.isFinite(retryAfter) && retryAfter >= 0
    ? Math.min(retryAfter * 1000, 5000)
    : 500 * (attempt + 1);
};

const fetchElevationBatch = async (points: [number, number][]): Promise<(number | null)[]> => {
  const lats = points.map(([, lat]) => lat).join(",");
  const lons = points.map(([lon]) => lon).join(",");
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
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
    if (response.status !== 429 || attempt === MAX_RETRIES) {
      throw new Error(`Open-Meteo Elevation: ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
  }
  throw new Error("Korkeuspalvelun pyyntö epäonnistui");
};

export async function elevationAt(lat: number, lon: number, signal?: AbortSignal): Promise<number | null> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now() && !Array.isArray(hit.value)) return hit.value;
  let r: Response | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    r = await fetchWithDebug(`${BASE}?latitude=${lat}&longitude=${lon}`, { signal }, "elevation");
    if (r.ok) break;
    if (r.status !== 429 || attempt === MAX_RETRIES) throw new Error(`Open-Meteo Elevation: ${r.status}`);
    await new Promise((resolve) => setTimeout(resolve, retryDelay(r!, attempt)));
  }
  if (!r || !r.ok) throw new Error("Korkeuspalvelun pyyntö epäonnistui");
  const j: unknown = await r.json();
  if (!j || typeof j !== "object" || !("elevation" in j)) {
    throw new Error("Korkeuspalvelun vastaus oli virheellisessä muodossa");
  }
  const raw = (j as { elevation: unknown }).elevation;
  const value = Array.isArray(raw) ? parseElevation(raw[0] ?? null) : parseElevation(raw);
  cache.set(key, { value, expires: Date.now() + 60_000 });
  return value;
}

export async function elevationBatch(points: [number, number][]): Promise<(number | null)[]> {
  if (points.length === 0) return [];
  const key = points.map(([lon, lat]) => `${lon.toFixed(4)},${lat.toFixed(4)}`).join("|");
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now() && Array.isArray(hit.value)) return hit.value;
  const values: (number | null)[] = [];
  for (let start = 0; start < points.length; start += BATCH_SIZE) {
    values.push(...await fetchElevationBatch(points.slice(start, start + BATCH_SIZE)));
  }
  cache.set(key, { value: values, expires: Date.now() + 60_000 });
  return values;
}