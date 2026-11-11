const BASE = "https://api.open-meteo.com/v1/elevation";

export async function elevationAt(lat: number, lon: number, signal?: AbortSignal): Promise<number | null> {
  const r = await fetch(`${BASE}?latitude=${lat}&longitude=${lon}`, { signal });
  if (!r.ok) return null;
  const j = await r.json();
  if (Array.isArray(j.elevation)) {
    return j.elevation[0] ?? null;
  }
  return j.elevation ?? null;
}

export async function elevationBatch(points: [number, number][]): Promise<(number | null)[]> {
  if (points.length === 0) return [];
  const lats = points.map(([_, lat]) => lat).join(",");
  const lons = points.map(([lon, _]) => lon).join(",");
  const r = await fetch(`${BASE}?latitude=${lats}&longitude=${lons}`);
  if (!r.ok) throw new Error(`Open-Meteo Elevation: ${r.status}`);
  const j = await r.json();
  if (Array.isArray(j.elevation)) {
    return j.elevation.map((x: any) => (typeof x === "number" ? x : null));
  }
  return points.map(() => null);
}