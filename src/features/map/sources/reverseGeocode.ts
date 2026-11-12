type NominatimReverseResponse = {
  name?: string;
  display_name?: string;
  address?: {
    road?: string;
    pedestrian?: string;
    footway?: string;
    path?: string;
    house_number?: string;
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    village?: string;
    hamlet?: string;
    town?: string;
    city?: string;
    municipality?: string;
  };
};

function extractLonLat(geojson: string): [number, number] | null {
  try {
    const parsed = JSON.parse(geojson) as { type?: string; coordinates?: unknown };
    const coords = parsed.coordinates;
    if (!Array.isArray(coords)) return null;
    if (parsed.type === "Point" && typeof coords[0] === "number" && typeof coords[1] === "number") {
      return [coords[0], coords[1]];
    }
    if (parsed.type === "LineString" && Array.isArray(coords[0])) {
      const first = coords[0] as unknown[];
      if (typeof first[0] === "number" && typeof first[1] === "number") return [first[0], first[1]];
    }
    if (parsed.type === "Polygon" && Array.isArray(coords[0]) && Array.isArray((coords[0] as unknown[])[0])) {
      const first = (coords[0] as unknown[][])[0];
      if (typeof first[0] === "number" && typeof first[1] === "number") return [first[0], first[1]];
    }
    return null;
  } catch {
    return null;
  }
}

function pickPlaceLabel(data: NominatimReverseResponse, fallback: string): string {
  const named = data.name?.trim();
  if (named) return named;
  const addr = data.address;
  if (addr) {
    const street = addr.road || addr.pedestrian || addr.footway || addr.path;
    if (street) {
      return addr.house_number ? `${street} ${addr.house_number}`.trim() : street.trim();
    }
    const locality =
      addr.neighbourhood ||
      addr.suburb ||
      addr.quarter ||
      addr.village ||
      addr.hamlet ||
      addr.town ||
      addr.city ||
      addr.municipality;
    if (locality?.trim()) return locality.trim();
  }
  const firstPart = data.display_name?.split(",")[0]?.trim();
  return firstPart || fallback;
}

/** Hakee lähimmän paikannimen GeoJSON-koordinaateille Nominatim-käänteishaulla. */
export async function resolveNearestPlaceName(
  geojson: string,
  fallback: string,
  offline = false,
): Promise<string> {
  if (offline) return fallback;
  const point = extractLonLat(geojson);
  if (!point) return fallback;
  const [lon, lat] = point;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=fi&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&zoom=18`,
      { signal: controller.signal },
    );
    if (!res.ok) return fallback;
    const data = (await res.json()) as NominatimReverseResponse;
    return pickPlaceLabel(data, fallback);
  } catch {
    return fallback;
  } finally {
    window.clearTimeout(timer);
  }
}
