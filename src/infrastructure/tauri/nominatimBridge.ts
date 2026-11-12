import { invokeTauri } from "./runtime";

export const nominatimSearchBackend = (query: string, limit = 5) =>
  invokeTauri<string>("nominatim_search", { query, limit });

export const nominatimReverseBackend = (lat: number, lon: number, zoom = 18) =>
  invokeTauri<string>("nominatim_reverse", { lat, lon, zoom });
