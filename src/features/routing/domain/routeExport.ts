import { exportGeoJsonFile } from "../../../infrastructure/export/exportFile";
import type { RouteResult } from "../services/routeService";

export async function exportRouteAsGeoJson(routeResult: RouteResult): Promise<string | null> {
  const content = JSON.stringify(
    {
      type: "Feature",
      properties: {
        provider: routeResult.provider,
        mode: routeResult.mode,
        distance_m: Math.round(routeResult.distance),
        duration_s: Math.round(routeResult.duration),
      },
      geometry: {
        type: "LineString",
        coordinates: routeResult.coordinates,
      },
    },
    null,
    2,
  );
  const filename = `reitti-${new Date().toISOString().slice(0, 10)}.geojson`;
  const result = await exportGeoJsonFile(filename, content);
  return result.status === "saved" ? result.path : null;
}
