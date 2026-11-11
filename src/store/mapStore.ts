import { create } from "zustand";
import * as bridge from "../services/tauriBridge";
import type { LocalSource } from "../services/tauriBridge";

export type Tool = "none" | "measure" | "streetview";
export interface ProfilePoint { dist: number; elev: number | null }
export interface Measure { length: number; geojson: string }

interface State {
  settings: Record<string, string>;
  sources: LocalSource[];
  basemap: string;
  overlays: string[];
  cursor: [number, number] | null;
  centerCoord: [number, number] | null;
  tool: Tool;
  streetViewPos: { lat: number; lng: number } | null;
  measure: Measure | null;
  profile: ProfilePoint[] | null;
  profileError: string | null;
  featuresVersion: number;
  settingsOpen: boolean;
  weatherModalOpen: boolean;

  loadAll: () => Promise<void>;
  setSetting: (k: string, v: string) => Promise<void>;
  reloadSources: () => Promise<void>;
  setBasemap: (id: string) => void;
  toggleOverlay: (id: string) => void;
  bumpFeatures: () => void;
}

export const useMapStore = create<State>((set, get) => ({
  settings: {},
  sources: [],
  basemap: "osm",
  overlays: [],
  cursor: null,
  centerCoord: null,
  tool: "none",
  streetViewPos: null,
  measure: null,
  profile: null,
  profileError: null,
  featuresVersion: 0,
  settingsOpen: false,
  weatherModalOpen: false,

  loadAll: async () => {
    const [settings, sources] = await Promise.all([bridge.getSettings(), bridge.listSources()]);
    set({ settings, sources, basemap: settings.basemap ?? "osm" });
  },
  setSetting: async (k, v) => {
    await bridge.setSetting(k, v);
    set({ settings: { ...get().settings, [k]: v } });
  },
  reloadSources: async () => set({ sources: await bridge.listSources() }),
  setBasemap: (id) => {
    set({ basemap: id });
    void get().setSetting("basemap", id);
  },
  toggleOverlay: (id) => {
    const o = get().overlays;
    set({ overlays: o.includes(id) ? o.filter((x) => x !== id) : [...o, id] });
  },
  bumpFeatures: () => set({ featuresVersion: get().featuresVersion + 1 }),
}));