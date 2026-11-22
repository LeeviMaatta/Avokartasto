export type RouteMode = "auto" | "bicycle" | "pedestrian";

export interface RoutePoint {
  coord: [number, number]; // [lon, lat]
  label: string;
}

export interface RouteStep {
  instruction: string;
  distance: number; // meters
  duration: number; // seconds
  coord: [number, number]; // [lon, lat]
}

export interface RouteResult {
  provider: "Valhalla" | "OSRM";
  mode: RouteMode;
  coordinates: [number, number][]; // [lon, lat][]
  distance: number; // meters
  duration: number; // seconds
  steps: RouteStep[];
}
