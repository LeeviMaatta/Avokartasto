import { create } from "zustand";
import * as bridge from "../services/tauriBridge";
import type { LocalSource } from "../services/tauriBridge";

export type Tool = "none" | "measure";
export interface ProfilePoint { dist: number; elev: number | null }
export interface Measure { length: number; geojson: string; kind: "distance" | "area" }
export interface LayerCopy {
  id: string;
  sourceId: string;
  name: string;
  role: "basemap" | "overlay";
  opacity: number;
}

export const DEFAULT_SETTINGS: Record<string, string> = {
  dataFetchMode: "mouse",
  showWgs: "1",
  showEtrs: "1",
  showElev: "1",
  showWeather: "0",
  showCenterCrosshair: "1",
  crosshairColor: "#dc2626",
  measurementUnits: "metric",
  measurementType: "distance",
  tileCache: "1",
  showLayerErrors: "1",
  basemap: "osm",
  overlays: "[]",
  overlayOrder: "[]",
  basemapOrder: "[]",
  layerCopies: "[]",
  layerViewSettings: "{}",
  lastMapCenter: "",
  lastMapZoom: "",
};

interface State {
  settings: Record<string, string>;
  sources: LocalSource[];
  basemap: string;
  overlays: string[];
  overlayOrder: string[];
  basemapOrder: string[];
  layerCopies: LayerCopy[];
  cursor: [number, number] | null;
  centerCoord: [number, number] | null;
  tool: Tool;
  measure: Measure | null;
  editingFeatureId: number | null;
  profile: ProfilePoint[] | null;
  profileError: string | null;
  featuresVersion: number;
  settingsOpen: boolean;
  weatherModalOpen: boolean;

  loadAll: () => Promise<void>;
  setSetting: (k: string, v: string) => Promise<void>;
  setSettings: (settings: Record<string, string>) => Promise<void>;
  reloadSources: () => Promise<void>;
  setBasemap: (id: string) => void;
  toggleOverlay: (id: string) => void;
  reorderOverlays: (fromId: string, toId: string) => void;
  reorderLayerList: (kind: "overlay" | "basemap", fromId: string, toId: string) => void;
  setLayerOrder: (kind: "overlay" | "basemap", ids: string[]) => void;
  duplicateOverlay: (id: string) => void;
  duplicateLayer: (sourceId: string, name: string, role: "basemap" | "overlay") => void;
  deleteLayerCopy: (id: string) => void;
  bumpFeatures: () => void;
}

export const useMapStore = create<State>((set, get) => ({
  settings: {},
  sources: [],
  basemap: "osm",
  overlays: [],
  overlayOrder: [],
  basemapOrder: [],
  layerCopies: [],
  cursor: null,
  centerCoord: null,
  tool: "none",
  measure: null,
  editingFeatureId: null,
  profile: null,
  profileError: null,
  featuresVersion: 0,
  settingsOpen: false,
  weatherModalOpen: false,

  loadAll: async () => {
    const [settings, sources] = await Promise.all([bridge.getSettings(), bridge.listSources()]);
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    let overlays: string[] = [];
    let overlayOrder: string[] = [];
    let basemapOrder: string[] = [];
    let layerCopies: LayerCopy[] = [];
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
    }
    try {
      const parsed = JSON.parse(merged.layerCopies ?? "[]");
      if (Array.isArray(parsed)) {
        layerCopies = parsed.filter((copy): copy is LayerCopy =>
          copy && typeof copy.id === "string" && typeof copy.sourceId === "string" &&
          typeof copy.name === "string" && (copy.role === "basemap" || copy.role === "overlay") &&
          typeof copy.opacity === "number"
        );
      }
    } catch {
      layerCopies = [];
    }
    set({ settings: merged, sources, basemap: merged.basemap ?? "osm", overlays, overlayOrder, basemapOrder, layerCopies });
  },
  setSetting: async (k, v) => {
    await bridge.setSetting(k, v);
    set({ settings: { ...get().settings, [k]: v } });
  },
  setSettings: async (settings) => {
    await bridge.setSettings(settings);
    set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
  },
  reloadSources: async () => set({ sources: await bridge.listSources() }),
  setBasemap: (id) => {
    set({ basemap: id });
    void get().setSetting("basemap", id);
  },
  toggleOverlay: (id) => {
    const o = get().overlays;
    const overlays = o.includes(id) ? o.filter((x) => x !== id) : [...o, id];
    const overlayOrder = get().overlayOrder.includes(id) ? get().overlayOrder : [...get().overlayOrder, id];
    set({ overlays, overlayOrder });
    void get().setSetting("overlays", JSON.stringify(overlays));
    void get().setSetting("overlayOrder", JSON.stringify(overlayOrder));
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
  duplicateOverlay: (id) => {
    const overlays = [...get().overlays, id];
    set({ overlays });
    void get().setSetting("overlays", JSON.stringify(overlays));
  },
  duplicateLayer: (sourceId, name, role) => {
    const copy: LayerCopy = {
      id: `${sourceId}-${Date.now()}`,
      sourceId,
      name: `${name} (kopio)`,
      role,
      opacity: 1,
    };
    const layerCopies = [...get().layerCopies, copy];
    set({ layerCopies });
    void get().setSetting("layerCopies", JSON.stringify(layerCopies));
  },
  deleteLayerCopy: (id) => {
    const layerCopies = get().layerCopies.filter((copy) => copy.id !== id);
    set({ layerCopies });
    void get().setSetting("layerCopies", JSON.stringify(layerCopies));
  },
  bumpFeatures: () => set({ featuresVersion: get().featuresVersion + 1 }),
}));