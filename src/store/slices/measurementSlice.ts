import type { MapSlice, MapState } from "./storeTypes";

export type MeasurementSlice = Pick<
  MapState,
  | "cursor"
  | "centerCoord"
  | "tool"
  | "measure"
  | "editingFeatureId"
  | "activeUnsavedMeasurementId"
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
>;

export const createMeasurementSlice: MapSlice<MeasurementSlice> = (set, get) => ({
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
  pendingMarker: null,
  markerEditorOpen: false,
  selectedFeature: null,

  bumpFeatures: () => set({ featuresVersion: get().featuresVersion + 1 }),
  toggleTool: (nextTool) => {
    const state = get();
    if (state.editingFeatureId !== null && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("remove-measurement-feature", { detail: { savedId: state.editingFeatureId } }));
    }
    set({
      tool: state.tool === nextTool ? "none" : nextTool,
      measure: null,
      profile: null,
      profileVisible: false,
      profileError: null,
      editingFeatureId: null,
      activeUnsavedMeasurementId: null,
      selectedFeature: null,
    });
  },
});
