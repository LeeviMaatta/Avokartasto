import { create } from "zustand";
import * as bridge from "../infrastructure/tauriBridge";
import type { LocalSource } from "../infrastructure/tauriBridge";
import { DEFAULT_SETTINGS } from "../features/settings/model/defaultSettings";
import type { Measure, ProfilePoint, SelectedFeature, Tool } from "../features/map/model/mapTypes";

export type { Measure, ProfilePoint, SelectedFeature, Tool } from "../features/map/model/mapTypes";
export { DEFAULT_SETTINGS } from "../features/settings/model/defaultSettings";

interface State {
  settings: Record<string, string>;
  sources: LocalSource[];
  basemap: string;
  overlays: string[];
  overlayOrder: string[];
  basemapOrder: string[];
  hiddenLayers: string[];
  cursor: [number, number] | null;
  centerCoord: [number, number] | null;
  tool: Tool;
  measure: Measure | null;
  editingFeatureId: number | null;
  profile: ProfilePoint[] | null;
  profileVisible: boolean;
  profileError: string | null;
  featuresVersion: number;
  settingsOpen: boolean;
  weatherModalOpen: boolean;
  persistenceError: string | null;
  pendingMarker: [number, number] | null;
  markerEditorOpen: boolean;
  selectedFeature: SelectedFeature | null;

  loadAll: () => Promise<void>;
  setSetting: (k: string, v: string) => Promise<void>;
  setSettings: (settings: Record<string, string>) => Promise<void>;
  reloadSources: () => Promise<void>;
  setBasemap: (id: string) => void;
  toggleOverlay: (id: string) => void;
  hideLayer: (id: string, role: "basemap" | "overlay") => void;
  restoreLayer: (id: string, role: "basemap" | "overlay") => void;
  reorderOverlays: (fromId: string, toId: string) => void;
  reorderLayerList: (kind: "overlay" | "basemap", fromId: string, toId: string) => void;
  setLayerOrder: (kind: "overlay" | "basemap", ids: string[]) => void;
  bumpFeatures: () => void;
  clearPersistenceError: () => void;
  setPendingMarker: (coordinates: [number, number] | null) => void;
}

export const useMapStore = create<State>((set, get) => ({
  settings: {},
  sources: [],
  basemap: "osm",
  overlays: [],
  overlayOrder: [],
  basemapOrder: [],
  hiddenLayers: [],
  cursor: null,
  centerCoord: null,
  tool: "none",
  measure: null,
  editingFeatureId: null,
  profile: null,
  profileVisible: false,
  profileError: null,
  featuresVersion: 0,
  settingsOpen: false,
  weatherModalOpen: false,
  persistenceError: null,
  pendingMarker: null,
  markerEditorOpen: false,
  selectedFeature: null,

  loadAll: async () => {
    const [settings, sources] = await Promise.all([bridge.getSettings(), bridge.listSources()]);
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    let overlays: string[] = [];
    let overlayOrder: string[] = [];
    let basemapOrder: string[] = [];
    let hiddenLayers: string[] = [];
    try {
      const parsed = JSON.parse(merged.overlays ?? "[]");
      if (Array.isArray(parsed)) overlays = parsed.filter((id): id is string => typeof id === "string");
    } catch {
      overlays = [];
    }
    for (const [key, setter] of [["overlayOrder", (value: string[]) => { overlayOrder = value; }], ["basemapOrder", (value: string[]) => { basemapOrder = value; }]] as const) {
      try {
        const parsed = JSON.parse(merged[key] ?? "[]");
        if (Array.isArray(parsed)) setter(parsed.filter((id): id is string => typeof id === "string"));
      } catch {
        setter([]);
      }
      try {
        const parsed = JSON.parse(merged.hiddenLayers ?? "[]");
        if (Array.isArray(parsed)) hiddenLayers = parsed.filter((id): id is string => typeof id === "string");
      } catch {
        hiddenLayers = [];
      }
    }
    const byBuiltin = new Map(sources.filter((source) => source.builtin_key).map((source) => [source.builtin_key!, `src:${source.id}`]));
    const byId = new Map(sources.map((source) => [`src:${source.id}`, source]));
    const normalizeId = (id: string) => {
      if (id.startsWith("src:")) return byId.has(id) ? id : null;
      if (id.startsWith("local:")) return byId.has(`src:${id.slice(6)}`) ? `src:${id.slice(6)}` : null;
      if (id.startsWith("copy:")) return null;
      return byBuiltin.get(id) ?? null;
    };
    const normalized = (ids: string[]) => ids.map(normalizeId).filter((id): id is string => Boolean(id));
    const normalizedBasemap = normalizeId(merged.basemap ?? "osm") ?? byBuiltin.get("osm") ?? "";
    set({
      settings: { ...merged, basemap: normalizedBasemap },
      sources,
      basemap: normalizedBasemap,
      overlays: normalized(overlays),
      overlayOrder: normalized(overlayOrder),
      basemapOrder: normalized(basemapOrder),
      hiddenLayers: normalized(hiddenLayers),
    });
  },
  setSetting: async (k, v) => {
    try {
      await bridge.setSetting(k, v);
      set({ settings: { ...get().settings, [k]: v }, persistenceError: null });
    } catch (error) {
      console.error(`Asetuksen ${k} tallennus epäonnistui`, error);
      set({ persistenceError: "Asetusta ei voitu tallentaa." });
    }
  },
  setSettings: async (settings) => {
    try {
      await bridge.setSettings(settings);
      set({ settings: { ...DEFAULT_SETTINGS, ...settings }, persistenceError: null });
    } catch (error) {
      console.error("Asetusten tallennus epäonnistui", error);
      set({ persistenceError: "Asetuksia ei voitu tallentaa." });
    }
  },
  reloadSources: async () => {
    try {
      set({ sources: await bridge.listSources(), persistenceError: null });
    } catch (error) {
      console.error("Karttalähteiden lataus epäonnistui", error);
      set({ persistenceError: "Karttalähteitä ei voitu ladata." });
    }
  },
  setBasemap: (id) => {
    set({ basemap: id });
    void get().setSetting("basemap", id);
  },
  toggleOverlay: (id) => {
    const o = get().overlays;
    const overlays = o.includes(id) ? o.filter((x) => x !== id) : [...o, id];
    const overlayOrder = get().overlayOrder.includes(id) ? get().overlayOrder : [...get().overlayOrder, id];
    const hiddenLayers = overlays.includes(id) ? get().hiddenLayers.filter((x) => x !== id) : get().hiddenLayers;
    set({ overlays, overlayOrder, hiddenLayers });
    void get().setSetting("overlays", JSON.stringify(overlays));
    void get().setSetting("overlayOrder", JSON.stringify(overlayOrder));
    void get().setSetting("hiddenLayers", JSON.stringify(hiddenLayers));
  },
  hideLayer: (id, role) => {
    const hiddenLayers = get().hiddenLayers.includes(id) ? get().hiddenLayers : [...get().hiddenLayers, id];
    const overlays = role === "overlay" ? get().overlays.filter((layer) => layer !== id) : get().overlays;
    const fallback = get().sources.find((source) => source.builtin_key === "osm");
    set({ hiddenLayers, overlays, ...(role === "basemap" && get().basemap === id && fallback ? { basemap: `src:${fallback.id}` } : {}) });
    void get().setSetting("hiddenLayers", JSON.stringify(hiddenLayers));
    if (role === "overlay") void get().setSetting("overlays", JSON.stringify(overlays));
  },
  restoreLayer: (id, role) => {
    const hiddenLayers = get().hiddenLayers.filter((layer) => layer !== id);
    const overlays = role === "overlay" && !get().overlays.includes(id) ? [...get().overlays, id] : get().overlays;
    set({ hiddenLayers, overlays, ...(role === "basemap" ? { basemap: id } : {}) });
    void get().setSetting("hiddenLayers", JSON.stringify(hiddenLayers));
    if (role === "overlay") void get().setSetting("overlays", JSON.stringify(overlays));
    if (role === "basemap") void get().setSetting("basemap", id);
  },
  reorderOverlays: (fromId, toId) => {
    const current = [...get().overlays];
    const from = current.indexOf(fromId);
    const to = current.indexOf(toId);
    if (from < 0 || to < 0 || from === to) return;
    current.splice(from, 1);
    current.splice(to, 0, fromId);
    set({ overlays: current });
    void get().setSetting("overlays", JSON.stringify(current));
  },
  reorderLayerList: (kind, fromId, toId) => {
    const key = kind === "overlay" ? "overlayOrder" : "basemapOrder";
    const current = [...get()[key]];
    if (!current.includes(fromId)) current.push(fromId);
    if (!current.includes(toId)) current.push(toId);
    const from = current.indexOf(fromId);
    const to = current.indexOf(toId);
    if (from < 0 || to < 0 || from === to) return;
    current.splice(from, 1);
    current.splice(to, 0, fromId);
    set(kind === "overlay" ? { overlayOrder: current } : { basemapOrder: current });
    void get().setSetting(key, JSON.stringify(current));
  },
  setLayerOrder: (kind, ids) => {
    const key = kind === "overlay" ? "overlayOrder" : "basemapOrder";
    const unique = [...new Set(ids)];
    set(kind === "overlay" ? { overlayOrder: unique } : { basemapOrder: unique });
    void get().setSetting(key, JSON.stringify(unique));
  },
  bumpFeatures: () => set({ featuresVersion: get().featuresVersion + 1 }),
  clearPersistenceError: () => set({ persistenceError: null }),
  setPendingMarker: (coordinates) => set({ pendingMarker: coordinates }),
}));