import { invoke } from "@tauri-apps/api/core";

export interface LocalSource {
  id: number;
  name: string;
  base_path: string;
  pattern: string;
  projection: string;
  role: "basemap" | "overlay";
  opacity: number;
  max_zoom: number;
  attribution: string;
  api_type: "tile" | "wmts" | "wms" | "vector";
  tile_size: number;
  layer_name: string;
  style: string;
}
export interface UserFeature { id: number; title: string; description: string | null; feature_type: string; geojson: string; created_at: string }

export const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Windows/Android käyttävät http://<scheme>.localhost, muut <scheme>://localhost */
export const tileUrl = (id: number) =>
  navigator.userAgent.includes("Windows")
    ? `http://app-tile.localhost/${id}/{z}/{x}/{y}`
    : `app-tile://localhost/${id}/{z}/{x}/{y}`;

export const lantmaterietTileUrl = () =>
  navigator.userAgent.includes("Windows")
    ? "http://lantmateriet-tile.localhost/{z}/{x}/{y}.png"
    : "lantmateriet-tile://localhost/{z}/{x}/{y}.png";

export const fetchLantmaterietTile = (z: number, x: number, y: number) =>
  invoke<number[]>("fetch_lantmateriet_tile", { z, x, y });

// Selaimessa (npm run dev ilman Tauria) asetukset tallennetaan localStorageen kehityskäyttöä varten.
const LS = "karttasovellus.settings";

export const getSettings = async (): Promise<Record<string, string>> =>
  inTauri() ? invoke("get_settings") : JSON.parse(localStorage.getItem(LS) ?? "{}");

export const setSetting = async (key: string, value: string) => {
  if (inTauri()) return invoke<void>("set_setting", { key, value });
  const s = JSON.parse(localStorage.getItem(LS) ?? "{}");
  s[key] = value;
  localStorage.setItem(LS, JSON.stringify(s));
};

export const setSettings = async (settings: Record<string, string>) => {
  if (inTauri()) return invoke<void>("set_settings", { settings });
  localStorage.setItem(LS, JSON.stringify(settings));
};

export const listSources = async (): Promise<LocalSource[]> => (inTauri() ? invoke("list_sources") : []);
export const addSource = (
  name: string,
  basePath: string,
  pattern: string,
  role: "basemap" | "overlay" = "basemap",
  opacity = 1,
  maxZoom = 19,
  attribution = "",
  apiType: LocalSource["api_type"] = "tile",
  tileSize = 256,
  layerName = "",
  style = "",
) => invoke<number>("add_source", { name, basePath, pattern, role, opacity, maxZoom, attribution, apiType, tileSize, layerName, style });
export const updateSource = (
  id: number,
  name: string,
  basePath: string,
  pattern: string,
  role: "basemap" | "overlay",
  opacity: number,
  maxZoom: number,
  attribution: string,
  apiType: LocalSource["api_type"],
  tileSize: number,
  layerName: string,
  style: string,
) => invoke<void>("update_source", { id, name, basePath, pattern, role, opacity, maxZoom, attribution, apiType, tileSize, layerName, style });
export const deleteSource = (id: number) => invoke<void>("delete_source", { id });

export const listFeatures = async (): Promise<UserFeature[]> => (inTauri() ? invoke("list_features") : []);
export const addFeature = (title: string, description: string | null, featureType: string, geojson: string) =>
  invoke<number>("add_feature", { title, description, featureType, geojson });
export const updateFeature = (id: number, title: string, description: string | null, featureType: string, geojson: string) =>
  invoke<void>("update_feature", { id, title, description, featureType, geojson });
export const deleteFeature = (id: number) => invoke<void>("delete_feature", { id });
