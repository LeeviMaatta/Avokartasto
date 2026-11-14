import { useEffect, useState } from "react";
import { useMapStore } from "../../../store/mapStore";
import { deleteFeature, listFeatures, updateFeature, type UserFeature } from "../../../infrastructure/tauri";
import { requestConfirmation } from "../../../app/confirmation";
import type { MarkerFolder } from "../model/markerTypes";
import { getFeatureFocusLonLat } from "../../measurements/domain/measurementSource";

export function useMarkerFoldersCrud(
  settings: Record<string, string>,
  featuresVersion: number,
  bumpFeatures: () => void,
  onClearActionMenu: () => void,
) {
  const [features, setFeatures] = useState<UserFeature[]>([]);
  const [folders, setFolders] = useState<MarkerFolder[]>([]);
  const [folderDraft, setFolderDraft] = useState("");
  const [folderEdit, setFolderEdit] = useState<MarkerFolder | null>(null);
  const [folderEditName, setFolderEditName] = useState("");

  useEffect(() => {
    listFeatures().then(setFeatures).catch((error) => console.error("Merkkien lataus epäonnistui", error));
  }, [featuresVersion]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(settings.markerFolders ?? "[]") as MarkerFolder[];
      setFolders(Array.isArray(parsed) ? parsed.filter((folder) => typeof folder.id === "string" && typeof folder.name === "string") : []);
    } catch {
      setFolders([]);
    }
  }, [settings.markerFolders]);

  const saveFolders = async (next: MarkerFolder[]) => {
    setFolders(next);
    await useMapStore.getState().setSetting("markerFolders", JSON.stringify(next));
  };

  const hiddenFeatureIds = (() => {
    try {
      const parsed = JSON.parse(settings.hiddenFeatures ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : [];
    } catch {
      return [];
    }
  })();

  const saveHiddenFeatureIds = (ids: number[]) => {
    void useMapStore.getState().setSetting("hiddenFeatures", JSON.stringify([...new Set(ids)]));
  };

  const toggleFeatureVisibility = (id: number) => {
    saveHiddenFeatureIds(
      hiddenFeatureIds.includes(id)
        ? hiddenFeatureIds.filter((featureId) => featureId !== id)
        : [...hiddenFeatureIds, id],
    );
  };

  const toggleFolderVisibility = (folder: MarkerFolder) => {
    void saveFolders(folders.map((item) => (item.id === folder.id ? { ...item, visible: !item.visible } : item)));
  };

  const renameFolder = (folder: MarkerFolder) => {
    setFolderEdit(folder);
    setFolderEditName(folder.name);
    onClearActionMenu();
  };

  const saveFolderEdit = () => {
    const name = folderEditName.trim();
    if (folderEdit && name && name !== folderEdit.name) {
      void saveFolders(folders.map((item) => (item.id === folderEdit.id ? { ...item, name } : item)));
    }
    setFolderEdit(null);
  };

  const removeFolder = async (folder: MarkerFolder) => {
    if (await requestConfirmation(`Poistetaanko kansio "${folder.name}"?`)) {
      const affected = features.filter((item) => item.folder_id === folder.id);
      await Promise.all(
        affected.map((item) =>
          updateFeature(item.id, item.title, item.description, item.feature_type, item.geojson, "", item.color, item.image_data),
        ),
      );
      await saveFolders(folders.filter((item) => item.id !== folder.id));
      if (affected.length > 0) bumpFeatures();
    }
    onClearActionMenu();
  };

  const addFolder = () => {
    const name = folderDraft.trim();
    if (!name) return;
    void saveFolders([...folders, { id: `folder-${Date.now()}`, name, visible: true }]);
    setFolderDraft("");
  };

  const openEditFeature = (feature: UserFeature) => {
    const focusCoord = getFeatureFocusLonLat(feature.geojson);
    if (focusCoord) {
      window.dispatchEvent(
        new CustomEvent("map-focus", {
          detail: { lon: focusCoord[0], lat: focusCoord[1], zoom: 13 },
        }),
      );
    }
    window.dispatchEvent(
      new CustomEvent<UserFeature>(
        feature.feature_type === "POINT" ? "open-marker-editor" : "open-measurement-editor",
        { detail: feature },
      ),
    );
  };

  const deleteSelectedFeature = async (feature: UserFeature) => {
    if (await requestConfirmation(`Haluatko varmasti poistaa merkinnän "${feature.title}"?`)) {
      await deleteFeature(feature.id);
      bumpFeatures();
      const state = useMapStore.getState();
      if (state.editingFeatureId === feature.id) {
        window.dispatchEvent(new CustomEvent("remove-measurement-feature", { detail: { savedId: feature.id } }));
        useMapStore.setState({
          measure: null,
          profile: null,
          profileVisible: false,
          profileError: null,
          editingFeatureId: null,
          activeUnsavedMeasurementId: null,
          selectedFeature: null,
        });
      } else if (state.selectedFeature?.id === feature.id) {
        useMapStore.setState({ selectedFeature: null });
      }
      window.dispatchEvent(new CustomEvent("feature-deleted", { detail: { id: feature.id } }));
    }
  };

  return {
    features,
    folders,
    folderDraft,
    setFolderDraft,
    folderEdit,
    setFolderEdit,
    folderEditName,
    setFolderEditName,
    hiddenFeatureIds,
    toggleFeatureVisibility,
    toggleFolderVisibility,
    renameFolder,
    saveFolderEdit,
    removeFolder,
    addFolder,
    openEditFeature,
    deleteSelectedFeature,
  };
}
