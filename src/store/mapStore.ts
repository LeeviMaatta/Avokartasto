import { create } from "zustand";
import * as bridge from "../infrastructure/tauriBridge";
import type { LocalSource } from "../infrastructure/tauriBridge";
import { DEFAULT_SETTINGS } from "../features/settings/model/defaultSettings";
import type { Measure, ProfilePoint, SelectedFeature, Tool } from "../features/map/model/mapTypes";
import type { RouteMode, RoutePoint, RouteResult } from "../features/routing/routeService";

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
  activeUnsavedMeasurementId: string | null;
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
  routePoints: (RoutePoint | null)[];
  routeMode: RouteMode;
  routeResult: RouteResult | null;
  routePickTarget: number | null;

  loadAll: () => Promise<void>;
  setSetting: (k: string, v: string) => Promise<void>;
  setSettings: (settings: Record<string, string>) => Promise<void>;
  reloadSources: () => Promise<void>;
  setBasemap: (id: string) => void;
  toggleOverlay: (id: string) => void;
  hideLayer: (id: string, role: "basemap" | "overlay") => void;
  hideLayers: (ids: string[]) => void;
  restoreLayer: (id: string, role: "basemap" | "overlay") => void;
  unhideLayers: (ids: string[]) => void;
  reorderOverlays: (fromId: string, toId: string) => void;
  reorderLayerList: (kind: "overlay" | "basemap", fromId: string, toId: string) => void;
  setLayerOrder: (kind: "overlay" | "basemap", ids: string[]) => void;
  bumpFeatures: () => void;
  clearPersistenceError: () => void;
  setPendingMarker: (coordinates: [number, number] | null) => void;
  setRoutePoint: (index: number, point: RoutePoint | null) => void;
  addRouteWaypoint: () => void;
  removeRoutePoint: (index: number) => void;
  swapRoutePoints: () => void;
  clearRoute: () => void;
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
  activeUnsavedMeasurementId: null,
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
  routePoints: [null, null],
  routeMode: "auto",
  routeResult: null,
  routePickTarget: 0,

  loadAll: async () => {
    const [settings, sources] = await Promise.all([bridge.getSettings(), bridge.listSources()]);
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    const parseIds = (raw: string | undefined): string[] => {
      try {
        const parsed: unknown = JSON.parse(raw ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
      } catch {
        return [];
      }
    };
    const overlays = parseIds(merged.overlays);
    const overlayOrder = parseIds(merged.overlayOrder);
    const basemapOrder = parseIds(merged.basemapOrder);
    const hiddenLayers = parseIds(merged.hiddenLayers);
    const byBuiltin = new Map(sources.filter((source) => source.builtin_key).map((source) => [source.builtin_key!, `src:${source.id}`]));
    const byId = new Map(sources.map((source) => [`src:${source.id}`, source]));
    const normalizeId = (id: string) => {
      if (id.startsWith("src:")) return byId.has(id) ? id : null;
      if (id.startsWith("local:")) return byId.has(`src:${id.slice(6)}`) ? `src:${id.slice(6)}` : null;
      if (id.startsWith("copy:")) return null;
      return byBuiltin.get(id) ?? null;
    };
    const normalized = (ids: string[]) => ids.map(normalizeId).filter((id): id is string => Boolean(id));
    const normalizedHidden = [...new Set(normalized(hiddenLayers))];
    const hiddenSet = new Set(normalizedHidden);
    const basemapCandidate = normalizeId(merged.basemap ?? "osm") ?? byBuiltin.get("osm") ?? "";
    const basemapSource = byId.get(basemapCandidate);
    const normalizedBasemap =
      basemapSource && basemapSource.role === "basemap" && !hiddenSet.has(basemapCandidate)
        ? basemapCandidate
        : (byBuiltin.get("osm") ?? basemapCandidate);
    const normalizedOverlays = [...new Set(normalized(overlays))].filter((id) => {
      const src = byId.get(id);
      return Boolean(src && src.role === "overlay" && !hiddenSet.has(id));
    });
    const normalizedBackdrop = merged.backdropLayerId ? (normalizeId(merged.backdropLayerId) ?? "") : "";
    set({
      settings: { ...merged, basemap: normalizedBasemap, backdropLayerId: normalizedBackdrop },
      sources,
      basemap: normalizedBasemap,
      overlays: normalizedOverlays,
      overlayOrder: normalized(overlayOrder),
      basemapOrder: normalized(basemapOrder),
      hiddenLayers: normalizedHidden,
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
    const nextBasemap = role === "basemap" && get().basemap === id && fallback ? `src:${fallback.id}` : null;
    set({ hiddenLayers, overlays, ...(nextBasemap ? { basemap: nextBasemap } : {}) });
    void get().setSetting("hiddenLayers", JSON.stringify(hiddenLayers));
    if (role === "overlay") void get().setSetting("overlays", JSON.stringify(overlays));
    if (nextBasemap) void get().setSetting("basemap", nextBasemap);
  },
  hideLayers: (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const hiddenLayers = [...new Set([...get().hiddenLayers, ...ids])];
    const overlays = get().overlays.filter((layer) => !idSet.has(layer));
    const overlaysChanged = overlays.length !== get().overlays.length;
    let nextBasemap: string | null = null;
    if (idSet.has(get().basemap)) {
      const fallback = get().sources.find((source) => source.builtin_key === "osm" && !idSet.has(`src:${source.id}`));
      const anyVisibleBasemap = get().sources.find((source) => source.role === "basemap" && !hiddenLayers.includes(`src:${source.id}`));
      const chosen = fallback ?? anyVisibleBasemap;
      if (chosen) nextBasemap = `src:${chosen.id}`;
    }
    set({ hiddenLayers, overlays, ...(nextBasemap ? { basemap: nextBasemap } : {}) });
    void get().setSetting("hiddenLayers", JSON.stringify(hiddenLayers));
    if (overlaysChanged) void get().setSetting("overlays", JSON.stringify(overlays));
    if (nextBasemap) void get().setSetting("basemap", nextBasemap);
  },
  restoreLayer: (id, role) => {
    const hiddenLayers = get().hiddenLayers.filter((layer) => layer !== id);
    const overlays = role === "overlay" && !get().overlays.includes(id) ? [...get().overlays, id] : get().overlays;
    set({ hiddenLayers, overlays, ...(role === "basemap" ? { basemap: id } : {}) });
    void get().setSetting("hiddenLayers", JSON.stringify(hiddenLayers));
    if (role === "overlay") void get().setSetting("overlays", JSON.stringify(overlays));
    if (role === "basemap") void get().setSetting("basemap", id);
  },
  unhideLayers: (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const hiddenLayers = get().hiddenLayers.filter((layer) => !idSet.has(layer));
    set({ hiddenLayers });
    void get().setSetting("hiddenLayers", JSON.stringify(hiddenLayers));
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
  setRoutePoint: (index, point) => {
    const next = [...get().routePoints];
    if (index >= 0 && index < next.length) {
      next[index] = point;
    }
    const nextEmpty = next.findIndex((p) => p === null);
    set({
      routePoints: next,
      routePickTarget: nextEmpty >= 0 ? nextEmpty : null,
    });
  },
  addRouteWaypoint: () => {
    const next = [...get().routePoints];
    // Lisätään välietappi ennen määränpäätä (viimeistä pistettä)
    const insertAt = Math.max(1, next.length - 1);
    next.splice(insertAt, 0, null);
    set({ routePoints: next, routePickTarget: insertAt });
  },
  removeRoutePoint: (index) => {
    const current = get().routePoints;
    if (current.length <= 2) {
      const next = [...current];
      next[index] = null;
      set({ routePoints: next, routeResult: null, routePickTarget: index });
      return;
    }
    const next = current.filter((_, i) => i !== index);
    set({ routePoints: next, routePickTarget: null });
  },
  swapRoutePoints: () => {
    const next = [...get().routePoints].reverse();
    set({ routePoints: next });
  },
  clearRoute: () => set({ routePoints: [null, null], routeResult: null, routePickTarget: 0 }),
}));