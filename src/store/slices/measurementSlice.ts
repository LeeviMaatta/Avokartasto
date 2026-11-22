import type { MapSlice, MapState } from "./storeTypes";
import {
  addMeasurementLink,
  removeMeasurementFromLinks,
} from "../../features/measurements/domain/measurementSelection";

export type MeasurementSlice = Pick<
  MapState,
  | "cursor"
  | "centerCoord"
  | "tool"
  | "measure"
  | "editingFeatureId"
  | "activeUnsavedMeasurementId"
  | "selectedMeasurements"
  | "measurementLinks"
  | "profile"
  | "profileVisible"
  | "profileError"
  | "featuresVersion"
  | "settingsOpen"
  | "weatherModalOpen"
  | "pendingMarker"
  | "markerEditorOpen"
  | "selectedFeature"
  | "bumpFeatures"
  | "toggleTool"
  | "linkMeasurements"
  | "unlinkMeasurement"
  | "clearMeasurementSelection"
>;

export const createMeasurementSlice: MapSlice<MeasurementSlice> = (set, get) => ({
  cursor: null,
  centerCoord: null,
  tool: "none",
  measure: null,
  editingFeatureId: null,
  activeUnsavedMeasurementId: null,
  selectedMeasurements: [],
  measurementLinks: {},
  profile: null,
  profileVisible: false,
  profileError: null,
  featuresVersion: 0,
  settingsOpen: false,
  weatherModalOpen: false,
  pendingMarker: null,
  markerEditorOpen: false,
  selectedFeature: null,

  bumpFeatures: () => set({ featuresVersion: get().featuresVersion + 1 }),
  toggleTool: (nextTool) => {
    const state = get();
    if (typeof window !== "undefined") {
      const savedIds = new Set<number>();
      if (state.editingFeatureId !== null) savedIds.add(state.editingFeatureId);
      state.selectedMeasurements.forEach((item) => {
        if (item.savedId !== null) savedIds.add(item.savedId);
      });
      savedIds.forEach((savedId) => {
        window.dispatchEvent(new CustomEvent("remove-measurement-feature", { detail: { savedId } }));
      });
    }
    set({
      tool: state.tool === nextTool ? "none" : nextTool,
      measure: null,
      profile: null,
      profileVisible: false,
      profileError: null,
      editingFeatureId: null,
      activeUnsavedMeasurementId: null,
      selectedMeasurements: [],
      selectedFeature: null,
    });
  },
  linkMeasurements: (idA, idB) =>
    set((state) => ({ measurementLinks: addMeasurementLink(state.measurementLinks, idA, idB) })),
  unlinkMeasurement: (id) =>
    set((state) => ({ measurementLinks: removeMeasurementFromLinks(state.measurementLinks, id) })),
  clearMeasurementSelection: () =>
    set({
      measure: null,
      profile: null,
      profileVisible: false,
      profileError: null,
      editingFeatureId: null,
      activeUnsavedMeasurementId: null,
      selectedMeasurements: [],
      selectedFeature: null,
    }),
});
