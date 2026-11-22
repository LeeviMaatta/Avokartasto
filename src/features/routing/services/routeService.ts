import { fetchWithDebug } from "../../debug/services/debugFetch";
import type { RouteMode, RoutePoint, RouteResult, RouteStep } from "../model/routeTypes";
import { decodePolyline } from "./polylineDecoder";
import { formatOsrmStep, formatRouteDistance, formatRouteDuration } from "./routeFormatting";

export {
  decodePolyline,
  formatRouteDistance,
  formatRouteDuration,
  type RouteMode,
  type RoutePoint,
  type RouteResult,
  type RouteStep,
};

async function fetchValhallaRoute(
  points: RoutePoint[],
  mode: RouteMode,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const body = {
    locations: points.map((p) => ({ lon: p.coord[0], lat: p.coord[1] })),
    costing: mode,
    directions_options: { units: "kilometers", language: "fi-FI" },
  };

  const r = await fetchWithDebug(
    "https://valhalla1.openstreetmap.de/route",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    },
    "route-valhalla",
  );
  if (!r.ok) throw new Error(`Valhalla HTTP ${r.status}`);

  const data = (await r.json()) as {
    trip?: {
      summary?: { length?: number; time?: number };
      legs?: Array<{
        shape?: string;
        maneuvers?: Array<{
          instruction?: string;
          length?: number;
          time?: number;
          begin_shape_index?: number;
        }>;
      }>;
    };
  };

  const legs = data.trip?.legs;
  if (!Array.isArray(legs) || legs.length === 0) {
    throw new Error("Valhalla ei palauttanut reittiä");
  }

  const allCoords: [number, number][] = [];
  const steps: RouteStep[] = [];
  for (const leg of legs) {
    const legCoords = leg.shape ? decodePolyline(leg.shape, 6) : [];
    const offset = allCoords.length;
    if (offset > 0 && legCoords.length > 0) allCoords.push(...legCoords.slice(1));
    else allCoords.push(...legCoords);

    for (const m of leg.maneuvers ?? []) {
      const idx = Math.min(Math.max(0, m.begin_shape_index ?? 0), Math.max(0, legCoords.length - 1));
      const coord = legCoords[idx] ?? points[0].coord;
      steps.push({
        instruction: m.instruction || "Jatka eteenpäin",
        distance: (m.length ?? 0) * 1000,
        duration: m.time ?? 0,
        coord,
      });
    }
  }

  if (allCoords.length < 2) throw new Error("Reitin geometria puuttuu");

  return {
    provider: "Valhalla",
    mode,
    coordinates: allCoords,
    distance: (data.trip?.summary?.length ?? 0) * 1000,
    duration: data.trip?.summary?.time ?? 0,
    steps,
  };
}

async function fetchOsrmRoute(
  points: RoutePoint[],
  mode: RouteMode,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const profile = mode === "auto" ? "driving" : mode === "bicycle" ? "bike" : "foot";
  const coordsParam = points.map((p) => `${p.coord[0]},${p.coord[1]}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coordsParam}?overview=full&geometries=geojson&steps=true`;

  const r = await fetchWithDebug(url, { signal }, "route-osrm");
  if (!r.ok) throw new Error(`OSRM HTTP ${r.status}`);

  const data = (await r.json()) as {
    routes?: Array<{
      distance?: number;
      duration?: number;
      geometry?: { coordinates?: [number, number][] };
      legs?: Array<{
        steps?: Array<{
          maneuver?: { type?: string; modifier?: string; location?: [number, number] };
          name?: string;
          distance?: number;
          duration?: number;
        }>;
      }>;
    }>;
  };

  const route = data.routes?.[0];
  const coords = route?.geometry?.coordinates;
  if (!route || !Array.isArray(coords) || coords.length < 2) {
    throw new Error("Reittiä ei löytynyt");
  }

  const steps: RouteStep[] = [];
  for (const leg of route.legs ?? []) {
    for (const s of leg.steps ?? []) {
      steps.push({
        instruction: formatOsrmStep(s),
        distance: s.distance ?? 0,
        duration: s.duration ?? 0,
        coord: s.maneuver?.location ?? coords[0],
      });
    }
  }

  return {
    provider: "OSRM",
    mode,
    coordinates: coords,
    distance: route.distance ?? 0,
    duration: route.duration ?? 0,
    steps,
  };
}

export async function calculateRoute(
  points: RoutePoint[],
  mode: RouteMode,
  signal?: AbortSignal,
): Promise<RouteResult> {
  if (points.length < 2) {
    throw new Error("Valitse vähintään lähtöpiste ja määränpää.");
  }
  try {
    return await fetchValhallaRoute(points, mode, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    return await fetchOsrmRoute(points, mode, signal);
  }
}
