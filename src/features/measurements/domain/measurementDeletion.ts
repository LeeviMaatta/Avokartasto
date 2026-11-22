import { requestConfirmation } from "../../../app/confirmation";
import { deleteFeature } from "../../../infrastructure/tauri";
import { useMapStore } from "../../../store/mapStore";
import type { SelectedMeasurementItem } from "./measurementSelection";

/** Deletes all selected saved and/or unsaved measurements. Returns true when deletion completed. */
export async function deleteSelectedMeasurements(
  items: SelectedMeasurementItem[],
  bumpFeatures: () => void,
): Promise<boolean> {
  if (items.length === 0) return false;
  const savedItems = items.filter((item) => item.savedId !== null);
  if (savedItems.length > 0) {
    const prompt =
      items.length === 1
        ? `Haluatko varmasti poistaa mittauksen "${savedItems[0].title || "Mittaus"}"?`
        : `Haluatko varmasti poistaa ${items.length} valittua mittausta?`;
    if (!(await requestConfirmation(prompt))) return false;
    for (const item of savedItems) {
      await deleteFeature(item.savedId!);
      useMapStore.getState().unlinkMeasurement(`saved:${item.savedId}`);
      window.dispatchEvent(
        new CustomEvent("remove-measurement-feature", { detail: { savedId: item.savedId } }),
      );
    }
    bumpFeatures();
  }
  const hadUnsaved = items.some((item) => item.savedId === null && Boolean(item.unsavedId));
  for (const item of items) {
    if (item.savedId === null && item.unsavedId) {
      window.dispatchEvent(
        new CustomEvent("remove-measurement-feature", { detail: { unsavedId: item.unsavedId } }),
      );
    }
  }
  useMapStore.getState().clearMeasurementSelection();
  if (hadUnsaved && useMapStore.getState().tool === "measure") {
    window.dispatchEvent(new CustomEvent("focus-next-unsaved-measurement"));
  }
  return true;
}

/** Removes all unsaved measurements from map and selection while keeping any active saved edit intact. */
export function clearAllUnsavedMeasurements(): void {
  window.dispatchEvent(new CustomEvent("clear-unsaved-measurements"));
  const state = useMapStore.getState();
  const remainingSaved = state.selectedMeasurements.filter((item) => item.savedId !== null);
  const clearMeasureFields = state.editingFeatureId === null && remainingSaved.length === 0;
  useMapStore.setState({
    measurementLinks: {},
    activeUnsavedMeasurementId: null,
    selectedMeasurements: remainingSaved,
    ...(clearMeasureFields
      ? {
          measure: null,
          profile: null,
          profileVisible: false,
          profileError: null,
          selectedFeature: state.selectedFeature?.kind === "marker" ? state.selectedFeature : null,
        }
      : {}),
  });
}
