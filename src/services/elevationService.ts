const BASE = "https://api.open-meteo.com/v1/elevation";
const cache = new Map<string, { value: number | null | (number | null)[]; expires: number }>();

export async function elevationAt(lat: number, lon: number, signal?: AbortSignal): Promise<number | null> {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now() && !Array.isArray(hit.value)) return hit.value;
  const r = await fetch(`${BASE}?latitude=${lat}&longitude=${lon}`, { signal });
  if (!r.ok) return null;
  const j = await r.json();
  const value = Array.isArray(j.elevation) ? (j.elevation[0] ?? null) : (j.elevation ?? null);
  cache.set(key, { value, expires: Date.now() + 60_000 });
  return value;
}

export async function elevationBatch(points: [number, number][]): Promise<(number | null)[]> {
  if (points.length === 0) return [];
  const key = points.map(([lon, lat]) => `${lon.toFixed(4)},${lat.toFixed(4)}`).join("|");
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now() && Array.isArray(hit.value)) return hit.value;
  const lats = points.map(([_, lat]) => lat).join(",");
  const lons = points.map(([lon, _]) => lon).join(",");
  const r = await fetch(`${BASE}?latitude=${lats}&longitude=${lons}`);
  if (!r.ok) throw new Error(`Open-Meteo Elevation: ${r.status}`);
  const j = await r.json();
  if (Array.isArray(j.elevation)) {
    const values = j.elevation.map((x: unknown) => (typeof x === "number" ? x : null));
    cache.set(key, { value: values, expires: Date.now() + 60_000 });
    return values;
  }
  return points.map(() => null);
}