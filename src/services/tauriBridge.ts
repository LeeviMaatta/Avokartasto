import { invoke } from "@tauri-apps/api/core";

export interface LocalSource { id: number; name: string; base_path: string; pattern: string; projection: string }
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

export const listSources = async (): Promise<LocalSource[]> => (inTauri() ? invoke("list_sources") : []);
export const addSource = (name: string, basePath: string, pattern: string) =>
  invoke<number>("add_source", { name, basePath, pattern });
export const deleteSource = (id: number) => invoke<void>("delete_source", { id });

export const listFeatures = async (): Promise<UserFeature[]> => (inTauri() ? invoke("list_features") : []);
export const addFeature = (title: string, description: string | null, featureType: string, geojson: string) =>
  invoke<number>("add_feature", { title, description, featureType, geojson });
export const deleteFeature = (id: number) => invoke<void>("delete_feature", { id });
