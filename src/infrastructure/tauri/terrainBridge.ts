import { invokeTauri } from "./runtime";

export const terrainFetchBinaryBackend = (url: string) =>
  invokeTauri<number[]>("terrain_fetch_binary", { url });

export const terrainOverpassQueryBackend = (query: string) =>
  invokeTauri<string>("terrain_overpass_query", { query });
