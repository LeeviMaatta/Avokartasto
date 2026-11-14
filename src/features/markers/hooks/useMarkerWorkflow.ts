import { useCallback, useEffect, useState } from "react";
import { useMapStore } from "../../../store/mapStore";
import { addFeature, deleteFeature, updateFeature, type UserFeature } from "../../../infrastructure/tauri";
import { requestConfirmation } from "../../../app/confirmation";
import type { MarkerDraft, MarkerFolder } from "../components/MarkerEditor";
import { resolveNearestPlaceName } from "../../search/services/reverseGeocode";
import type { SelectedFeature } from "../../map/model/mapTypes";

const emptyMarkerDraft = (geojson: string, folderId = ""): MarkerDraft => ({
  title: "",
  description: "",
  color: "#dc2626",
  folderId,
  geojson,
});

interface UseMarkerWorkflowOptions {
  tool: string;
  pendingMarker: [number, number] | null;
  selectedFeature: SelectedFeature | null;
  savedMarkerColor: string;
  markerFolders: MarkerFolder[];
  bumpFeatures: () => void;
  setMsg: (msg: string) => void;
  onResetMeasurementBeforeMarkerEdit: () => void;
}

export function useMarkerWorkflow({
  tool,
  pendingMarker,
  selectedFeature,
  savedMarkerColor,
  markerFolders,
  bumpFeatures,
  setMsg,
  onResetMeasurementBeforeMarkerEdit,
}: UseMarkerWorkflowOptions) {
  const [markerDraft, setMarkerDraft] = useState<MarkerDraft | null>(null);
  const [markerBusy, setMarkerBusy] = useState(false);

  // LayerSwitcher lähettää muokattavan merkin tänne, jotta kaikki tallennus
  // ja muokkaus tapahtuu samassa kartan yläreunan työkalupalkissa.
  useEffect(() => {
    const handleEditMarker = (event: Event) => {
      const feature = (event as CustomEvent<UserFeature>).detail;
      if (!feature) return;
      const currentState = useMapStore.getState();
      if (currentState.editingFeatureId !== null || currentState.activeUnsavedMeasurementId !== null) {
        window.dispatchEvent(
          new CustomEvent("remove-measurement-feature", {
            detail: {
              savedId: currentState.editingFeatureId,
              unsavedId: currentState.activeUnsavedMeasurementId,
            },
          }),
        );
      }
      onResetMeasurementBeforeMarkerEdit();
      useMapStore.setState({
        tool: "none",
        pendingMarker: null,
        markerEditorOpen: true,
        editingFeatureId: null,
        activeUnsavedMeasurementId: null,
        measure: null,
        profile: null,
        profileVisible: false,
        profileError: null,
        selectedFeature: null,
      });
      setMarkerDraft({
        id: feature.id,
        title: feature.title,
        description: feature.description ?? "",
        color: feature.color || "#dc2626",
        folderId: feature.folder_id ?? "",
        geojson: feature.geojson,
      });
      setMsg("");
    };
    window.addEventListener("open-marker-editor", handleEditMarker);
    return () => window.removeEventListener("open-marker-editor", handleEditMarker);
  }, [onResetMeasurementBeforeMarkerEdit, setMsg]);

  useEffect(() => {
    const onFeatureDeleted = (event: Event) => {
      const deletedId = (event as CustomEvent<{ id?: number }>).detail?.id;
      if (deletedId === undefined) return;
      setMarkerDraft((prev) => (prev?.id === deletedId ? null : prev));
    };
    window.addEventListener("feature-deleted", onFeatureDeleted);
    return () => window.removeEventListener("feature-deleted", onFeatureDeleted);
  }, []);

  useEffect(() => {
    if (!pendingMarker || tool === "measure") {
      setMarkerDraft((prev) => (prev && prev.id === undefined ? null : prev));
      return;
    }
    setMarkerDraft((prev) =>
      prev && prev.id !== undefined
        ? prev
        : emptyMarkerDraft(
            JSON.stringify({ type: "Point", coordinates: pendingMarker }),
            markerFolders[0]?.id ?? "",
          ),
    );
    setMsg("");
  }, [pendingMarker, tool, markerFolders, setMsg]);

  const saveMarker = async () => {
    if (!markerDraft || markerBusy) return;
    setMarkerBusy(true);
    setMsg("");
    try {
      const resolvedTitle =
        markerDraft.title.trim() ||
        (await resolveNearestPlaceName(markerDraft.geojson, "Merkki"));
      const args = [
        resolvedTitle,
        markerDraft.description.trim() || null,
        "POINT",
        markerDraft.geojson,
        markerDraft.folderId,
        savedMarkerColor,
        null,
      ] as const;
      if (markerDraft.id !== undefined) await updateFeature(markerDraft.id, ...args);
      else await addFeature(...args);
      bumpFeatures();
      setMarkerDraft(null);
      useMapStore.setState({ pendingMarker: null, markerEditorOpen: false, selectedFeature: null });
      setMsg("Tallennettu");
    } catch (error) {
      setMsg(`Tallennus epäonnistui: ${String(error)}`);
    } finally {
      setMarkerBusy(false);
    }
  };

  const cancelMarkerEdit = useCallback(() => {
    setMarkerDraft(null);
    useMapStore.setState({ pendingMarker: null, markerEditorOpen: false });
  }, []);

  const deleteMarker = async (): Promise<boolean> => {
    if (!markerDraft) return false;
    if (markerDraft.id !== undefined) {
      if (await requestConfirmation(`Haluatko varmasti poistaa merkin "${markerDraft.title || "Merkki"}"?`)) {
        await deleteFeature(markerDraft.id);
        bumpFeatures();
        setMarkerDraft(null);
        useMapStore.setState({ pendingMarker: null, markerEditorOpen: false, selectedFeature: null });
        setMsg("");
        return true;
      }
      return false;
    }
    setMarkerDraft(null);
    useMapStore.setState({ pendingMarker: null, markerEditorOpen: false, selectedFeature: null });
    setMsg("");
    return true;
  };

  const deleteSelectedMarker = async (): Promise<boolean> => {
    if (!selectedFeature || selectedFeature.kind !== "marker") return false;
    if (!(await requestConfirmation(`Haluatko varmasti poistaa merkin "${selectedFeature.title || "Merkki"}"?`))) {
      return false;
    }
    await deleteFeature(selectedFeature.id);
    bumpFeatures();
    useMapStore.setState({ selectedFeature: null });
    return true;
  };

  const editSelectedMarker = () => {
    if (!selectedFeature || selectedFeature.kind !== "marker") return;
    setMarkerDraft({
      id: selectedFeature.id,
      title: selectedFeature.title,
      description: selectedFeature.description ?? "",
      color: selectedFeature.color || "#dc2626",
      folderId: selectedFeature.folder_id ?? "",
      geojson: selectedFeature.geojson ?? "",
    });
  };

  return {
    markerDraft,
    setMarkerDraft,
    markerBusy,
    saveMarker,
    cancelMarkerEdit,
    deleteMarker,
    deleteSelectedMarker,
    editSelectedMarker,
  };
}
