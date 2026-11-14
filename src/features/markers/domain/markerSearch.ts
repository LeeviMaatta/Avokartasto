import { listFeatures, type UserFeature } from "../../../infrastructure/tauri";

export interface MarkerSearchHit {
  id: number;
  title: string;
  description: string | null;
  lon: number;
  lat: number;
  color: string;
}

/**
 * Hakee tallennetuista kohteista vain omat merkit (POINT), ei mittauksia.
 */
export async function searchSavedMarkers(query: string): Promise<MarkerSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const features: UserFeature[] = await listFeatures();
  const hits: MarkerSearchHit[] = [];

  for (const f of features) {
    if (f.feature_type !== "POINT") continue;
    const title = (f.title || "").toLowerCase();
    const desc = (f.description || "").toLowerCase();
    if (!title.includes(q) && !desc.includes(q)) continue;
    try {
      const geom = JSON.parse(f.geojson) as { type?: string; coordinates?: unknown };
      if (
        geom.type === "Point" &&
        Array.isArray(geom.coordinates) &&
        geom.coordinates.length >= 2 &&
        typeof geom.coordinates[0] === "number" &&
        typeof geom.coordinates[1] === "number"
      ) {
        hits.push({
          id: f.id,
          title: f.title || "Merkki",
          description: f.description,
          lon: geom.coordinates[0],
          lat: geom.coordinates[1],
          color: f.color || "#dc2626",
        });
      }
    } catch {
      // Ohitetaan virheellinen geometria
    }
  }
  return hits;
}
