export const BACKDROP_MAX_ZOOM = 14;
export const DEFAULT_BACKDROP_CENTER: [number, number] = [25.7, 62.6];

const OVERVIEW_FULL_MAX_ZOOM = 3;
const FOCUSED_TILE_RADIUS = 2;

export interface PlannedTile {
  z: number;
  x: number;
  y: number;
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
