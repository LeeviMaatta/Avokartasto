import * as bridge from "../../infrastructure/tauri";
import type { LocalSource } from "../../infrastructure/tauri";
import { DEFAULT_SETTINGS } from "../../features/settings/model/defaultSettings";
import type { MapSlice, MapState } from "./storeTypes";

function parseIdArray(raw: string | undefined): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function normalizeLoadedLayerState(merged: Record<string, string>, sources: LocalSource[]) {
  const byBuiltin = new Map(sources.filter((s) => s.builtin_key).map((s) => [s.builtin_key!, `src:${s.id}`]));
  const byId = new Map(sources.map((s) => [`src:${s.id}`, s]));
  const normalizeId = (id: string) => {
    if (id.startsWith("src:")) return byId.has(id) ? id : null;
    if (id.startsWith("local:")) return byId.has(`src:${id.slice(6)}`) ? `src:${id.slice(6)}` : null;
    if (id.startsWith("copy:")) return null;
    return byBuiltin.get(id) ?? null;
  };
  const normalizeList = (raw: string | undefined) =>
    parseIdArray(raw).map(normalizeId).filter((id): id is string => Boolean(id));

  const hiddenLayers = [...new Set(normalizeList(merged.hiddenLayers))];
  const hiddenSet = new Set(hiddenLayers);
  const basemapCandidate = normalizeId(merged.basemap ?? "osm") ?? byBuiltin.get("osm") ?? "";
  const basemapSource = byId.get(basemapCandidate);
  const basemap =
    basemapSource && basemapSource.role === "basemap" && !hiddenSet.has(basemapCandidate)
      ? basemapCandidate
      : (byBuiltin.get("osm") ?? basemapCandidate);
  const overlays = [...new Set(normalizeList(merged.overlays))].filter((id) => {
    const src = byId.get(id);
    return Boolean(src && src.role === "overlay" && !hiddenSet.has(id));
  });
  const backdropLayerId = merged.backdropLayerId ? (normalizeId(merged.backdropLayerId) ?? "") : "";

  return {
    settings: { ...merged, basemap, backdropLayerId },
    basemap,
    overlays,
    overlayOrder: normalizeList(merged.overlayOrder),
    basemapOrder: normalizeList(merged.basemapOrder),
    hiddenLayers,
  };
}

export type SettingsSlice = Pick<
  MapState,
  "settings" | "persistenceError" | "loadAll" | "setSetting" | "setSettings" | "clearPersistenceError"
>;

export const createSettingsSlice: MapSlice<SettingsSlice> = (set) => ({
  settings: {},
  persistenceError: null,
  loadAll: async () => {
    const [settings, sources] = await Promise.all([bridge.getSettings(), bridge.listSources()]);
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    const normalized = normalizeLoadedLayerState(merged, sources);
    set({
      sources,
      ...normalized,
    });
  },
  setSetting: async (k, v) => {
    set((state) => ({ settings: { ...state.settings, [k]: v }, persistenceError: null }));
    try {
      await bridge.setSetting(k, v);
    } catch (error) {
      console.error(`Asetuksen ${k} tallennus epäonnistui`, error);
      set({ persistenceError: "Asetusta ei voitu tallentaa." });
    }
  },
  setSettings: async (settings) => {
    const next = { ...DEFAULT_SETTINGS, ...settings };
    set({ settings: next, persistenceError: null });
    try {
      await bridge.setSettings(next);
    } catch (error) {
      console.error("Asetusten tallennus epäonnistui", error);
      set({ persistenceError: "Asetuksia ei voitu tallentaa." });
    }
  },
  clearPersistenceError: () => set({ persistenceError: null }),
});
