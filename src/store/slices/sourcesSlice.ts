import * as bridge from "../../infrastructure/tauri";
import type { MapSlice, MapState } from "./storeTypes";

export type SourcesSlice = Pick<
  MapState,
  | "sources"
  | "basemap"
  | "previousBasemap"
  | "overlays"
  | "overlayOrder"
  | "basemapOrder"
  | "hiddenLayers"
  | "reloadSources"
  | "setBasemap"
  | "switchToPreviousBasemap"
  | "toggleOverlay"
  | "hideLayer"
  | "hideLayers"
  | "restoreLayer"
  | "unhideLayers"
  | "reorderOverlays"
  | "setLayerOrder"
>;

export const createSourcesSlice: MapSlice<SourcesSlice> = (set, get) => ({
  sources: [],
  basemap: "osm",
  previousBasemap: null,
  overlays: [],
  overlayOrder: [],
  basemapOrder: [],
  hiddenLayers: [],

  reloadSources: async () => {
    try {
      const sources = await bridge.listSources();
      const prev = get().previousBasemap;
      const keepPrev =
        !prev ||
        !prev.startsWith("src:") ||
        sources.some((source) => `src:${source.id}` === prev && source.role === "basemap");
      set({
        sources,
        persistenceError: null,
        ...(keepPrev ? {} : { previousBasemap: null }),
      });
    } catch (error) {
      console.error("Karttalähteiden lataus epäonnistui", error);
      set({ persistenceError: "Karttalähteitä ei voitu ladata." });
    }
  },
  setBasemap: (id) => {
    const current = get().basemap;
    set({
      basemap: id,
      ...(current && current !== id ? { previousBasemap: current } : {}),
    });
    void get().setSetting("basemap", id);
  },
  switchToPreviousBasemap: () => {
    const { basemap, previousBasemap, hiddenLayers, sources } = get();
    if (!previousBasemap || previousBasemap === basemap) return;
    if (hiddenLayers.includes(previousBasemap)) return;
    if (
      previousBasemap.startsWith("src:") &&
      sources.length > 0 &&
      !sources.some((source) => `src:${source.id}` === previousBasemap && source.role === "basemap")
    ) {
      return;
    }
    set({ basemap: previousBasemap, previousBasemap: basemap });
    void get().setSetting("basemap", previousBasemap);
  },
  toggleOverlay: (id) => {
    const current = get().overlays;
    const overlays = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
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
    const clearPrevious = get().previousBasemap === id;
    set({
      hiddenLayers,
      overlays,
      ...(nextBasemap ? { basemap: nextBasemap } : {}),
      ...(clearPrevious ? { previousBasemap: null } : {}),
    });
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
    const prevBasemap = get().previousBasemap;
    const clearPrevious = Boolean(prevBasemap && idSet.has(prevBasemap));
    set({
      hiddenLayers,
      overlays,
      ...(nextBasemap ? { basemap: nextBasemap } : {}),
      ...(clearPrevious ? { previousBasemap: null } : {}),
    });
    void get().setSetting("hiddenLayers", JSON.stringify(hiddenLayers));
    if (overlaysChanged) void get().setSetting("overlays", JSON.stringify(overlays));
    if (nextBasemap) void get().setSetting("basemap", nextBasemap);
  },
  restoreLayer: (id, role) => {
    const hiddenLayers = get().hiddenLayers.filter((layer) => layer !== id);
    const overlays = role === "overlay" && !get().overlays.includes(id) ? [...get().overlays, id] : get().overlays;
    const currentBasemap = get().basemap;
    set({
      hiddenLayers,
      overlays,
      ...(role === "basemap"
        ? {
            basemap: id,
            ...(currentBasemap && currentBasemap !== id ? { previousBasemap: currentBasemap } : {}),
          }
        : {}),
    });
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
  setLayerOrder: (kind, ids) => {
    const key = kind === "overlay" ? "overlayOrder" : "basemapOrder";
    const unique = [...new Set(ids)];
    set(kind === "overlay" ? { overlayOrder: unique } : { basemapOrder: unique });
    void get().setSetting(key, JSON.stringify(unique));
  },
});
