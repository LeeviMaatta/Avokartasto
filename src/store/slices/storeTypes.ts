import type { StateCreator } from "zustand";
import type { LocalSource } from "../../infrastructure/tauri";
import type { Measure, ProfilePoint, SelectedFeature, Tool } from "../../features/map/model/mapTypes";
import type { RouteMode, RoutePoint, RouteResult } from "../../features/routing/services/routeService";

export interface MapState {
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
  setLayerOrder: (kind: "overlay" | "basemap", ids: string[]) => void;
  bumpFeatures: () => void;
  clearPersistenceError: () => void;
  toggleTool: (nextTool: Tool) => void;
  setRoutePoint: (index: number, point: RoutePoint | null) => void;
  addRouteWaypoint: () => void;
  removeRoutePoint: (index: number) => void;
  swapRoutePoints: () => void;
  clearRoute: () => void;
}

export type MapSlice<T> = StateCreator<MapState, [], [], T>;
