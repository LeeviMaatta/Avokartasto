import { useEffect, useMemo, useState } from "react";
import { useMapStore } from "../../../store/mapStore";
import { deleteFeature, listFeatures, updateFeature, type UserFeature } from "../../../infrastructure/tauri";
import { requestConfirmation } from "../../../app/confirmation";
import type { MarkerFolder } from "../model/markerTypes";
import { getFeatureFocusLonLat } from "../../measurements/domain/measurementSource";
import { exportMeasurement } from "../../measurements/domain/measurementExport";

function sortFeaturesByOrder(features: UserFeature[], orderIds: number[]): UserFeature[] {
  if (orderIds.length === 0) return features;
  const rank = new Map(orderIds.map((id, idx) => [id, idx]));
  return [...features].sort((a, b) => {
    const ai = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

export function useMarkerFoldersCrud(
  settings: Record<string, string>,
  featuresVersion: number,
  bumpFeatures: () => void,
  onClearActionMenu: () => void,
) {
  const [rawFeatures, setRawFeatures] = useState<UserFeature[]>([]);
  const [folders, setFolders] = useState<MarkerFolder[]>([]);
  const [featureOrder, setFeatureOrder] = useState<number[]>([]);
  const [folderEdit, setFolderEdit] = useState<MarkerFolder | null>(null);
  const [folderEditName, setFolderEditName] = useState("");
  const [exportMessage, setExportMessage] = useState("");

  useEffect(() => {
    listFeatures().then(setRawFeatures).catch((error) => console.error("Merkkien lataus epäonnistui", error));
  }, [featuresVersion]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(settings.markerFolders ?? "[]") as MarkerFolder[];
      setFolders(Array.isArray(parsed) ? parsed.filter((folder) => typeof folder.id === "string" && typeof folder.name === "string") : []);
    } catch {
      setFolders([]);
    }
  }, [settings.markerFolders]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(settings.featureOrder ?? "[]");
      setFeatureOrder(Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : []);
    } catch {
      setFeatureOrder([]);
    }
  }, [settings.featureOrder]);

  useEffect(() => {
    if (!exportMessage) return;
    const timer = window.setTimeout(() => setExportMessage(""), 3000);
    return () => window.clearTimeout(timer);
  }, [exportMessage]);

  const features = useMemo(() => sortFeaturesByOrder(rawFeatures, featureOrder), [rawFeatures, featureOrder]);

  const saveFolders = async (next: MarkerFolder[]) => {
    setFolders(next);
    await useMapStore.getState().setSetting("markerFolders", JSON.stringify(next));
  };

  const saveFeatureOrder = (nextOrder: number[]) => {
    const unique = [...new Set(nextOrder)];
    setFeatureOrder(unique);
    void useMapStore.getState().setSetting("featureOrder", JSON.stringify(unique));
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
      const affected = rawFeatures.filter((item) => item.folder_id === folder.id);
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

  const setFeatureFolder = async (feature: UserFeature, folderId: string) => {
    if ((feature.folder_id ?? "") === folderId) return;
    setRawFeatures((prev) => prev.map((item) => (item.id === feature.id ? { ...item, folder_id: folderId } : item)));
    await updateFeature(feature.id, feature.title, feature.description, feature.feature_type, feature.geojson, folderId, feature.color, feature.image_data);
    bumpFeatures();
  };

  const createFolderAndAssign = async (name: string, feature: UserFeature) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newFolder: MarkerFolder = { id: `folder-${Date.now()}`, name: trimmed, visible: true };
    await saveFolders([...folders, newFolder]);
    await setFeatureFolder(feature, newFolder.id);
  };

  const exportSavedMeasurement = async (feature: UserFeature) => {
    if (feature.feature_type === "POINT") return;
    const kind = feature.feature_type === "POLYGON" ? "area" : "distance";
    try {
      const res = await exportMeasurement({ length: 0, geojson: feature.geojson, kind }, feature.title);
      if (res.status === "saved") setExportMessage(`Viety: ${res.path}`);
    } catch (error) {
      setExportMessage(`Vienti epäonnistui: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const openEditFeature = (feature: UserFeature) => {
    const focusCoord = getFeatureFocusLonLat(feature.geojson);
    if (focusCoord) {
      window.dispatchEvent(new CustomEvent("map-focus", { detail: { lon: focusCoord[0], lat: focusCoord[1], zoom: 13 } }));
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
    setRawFeatures,
    folders,
    setFolders,
    featureOrder,
    setFeatureOrder,
    saveFolders,
    saveFeatureOrder,
    folderEdit,
    setFolderEdit,
    folderEditName,
    setFolderEditName,
    hiddenFeatureIds,
    exportMessage,
    toggleFeatureVisibility,
    toggleFolderVisibility,
    renameFolder,
    saveFolderEdit,
    removeFolder,
    setFeatureFolder,
    createFolderAndAssign,
    exportSavedMeasurement,
    openEditFeature,
    deleteSelectedFeature,
  };
}
