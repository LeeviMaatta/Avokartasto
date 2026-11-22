import { useEffect, useRef, useState, type Dispatch, type PointerEvent, type SetStateAction } from "react";
import { updateFeature, type UserFeature } from "../../../infrastructure/tauri";
import type { MarkerFolder } from "../model/markerTypes";

interface UseFeatureDragOptions {
  features: UserFeature[];
  folders: MarkerFolder[];
  setRawFeatures: Dispatch<SetStateAction<UserFeature[]>>;
  setFolders: Dispatch<SetStateAction<MarkerFolder[]>>;
  setFeatureOrder: Dispatch<SetStateAction<number[]>>;
  saveFolders: (next: MarkerFolder[]) => Promise<void>;
  saveFeatureOrder: (nextOrder: number[]) => void;
  bumpFeatures: () => void;
}

export function useFeatureDrag({
  features,
  folders,
  setRawFeatures,
  setFolders,
  setFeatureOrder,
  saveFolders,
  saveFeatureOrder,
  bumpFeatures,
}: UseFeatureDragOptions) {
  const [draggingFeatureId, setDraggingFeatureId] = useState<number | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);

  const featuresRef = useRef(features);
  featuresRef.current = features;
  const foldersRef = useRef(folders);
  foldersRef.current = folders;

  const dragMetaRef = useRef<{
    featureId: number | null;
    initialFolderId: string;
    currentFolderId: string;
    orderDirty: boolean;
    folderId: string | null;
    foldersDirty: boolean;
  }>({
    featureId: null,
    initialFolderId: "",
    currentFolderId: "",
    orderDirty: false,
    folderId: null,
    foldersDirty: false,
  });

  useEffect(() => {
    const stopDragging = () => {
      const meta = dragMetaRef.current;
      if (meta.featureId !== null) {
        const draggedId = meta.featureId;
        const targetFolderId = meta.currentFolderId;
        const folderChanged = targetFolderId !== meta.initialFolderId;
        if (meta.orderDirty) {
          saveFeatureOrder(featuresRef.current.map((f) => f.id));
        }
        if (folderChanged) {
          const item = featuresRef.current.find((f) => f.id === draggedId);
          if (item) {
            void updateFeature(
              item.id,
              item.title,
              item.description,
              item.feature_type,
              item.geojson,
              targetFolderId,
              item.color,
              item.image_data,
            ).then(() => bumpFeatures());
          }
        }
      }
      if (meta.folderId !== null && meta.foldersDirty) {
        void saveFolders(foldersRef.current);
      }
      dragMetaRef.current = {
        featureId: null,
        initialFolderId: "",
        currentFolderId: "",
        orderDirty: false,
        folderId: null,
        foldersDirty: false,
      };
      setDraggingFeatureId(null);
      setDraggingFolderId(null);
    };

    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [bumpFeatures, saveFeatureOrder, saveFolders]);

  const beginDragFeature = (event: PointerEvent, featureId: number) => {
    event.preventDefault();
    event.stopPropagation();
    const current = featuresRef.current.find((f) => f.id === featureId);
    const initialFolderId = current?.folder_id ?? "";
    dragMetaRef.current = {
      featureId,
      initialFolderId,
      currentFolderId: initialFolderId,
      orderDirty: false,
      folderId: null,
      foldersDirty: false,
    };
    setDraggingFeatureId(featureId);
  };

  const moveDraggedFeature = (targetFeatureId: number) => {
    const meta = dragMetaRef.current;
    if (meta.featureId === null || meta.featureId === targetFeatureId) return;
    const currentIds = featuresRef.current.map((f) => f.id);
    const from = currentIds.indexOf(meta.featureId);
    const to = currentIds.indexOf(targetFeatureId);
    if (from < 0 || to < 0) return;

    const targetFeature = featuresRef.current[to];
    const targetFolderId = targetFeature?.folder_id ?? "";
    const nextIds = [...currentIds];
    nextIds.splice(from, 1);
    nextIds.splice(to, 0, meta.featureId);
    meta.orderDirty = true;
    setFeatureOrder(nextIds);

    if (meta.currentFolderId !== targetFolderId) {
      meta.currentFolderId = targetFolderId;
      const movedId = meta.featureId;
      setRawFeatures((prev) =>
        prev.map((item) => (item.id === movedId ? { ...item, folder_id: targetFolderId } : item)),
      );
    }
  };

  const moveDraggedFeatureToFolder = (folderId: string) => {
    const meta = dragMetaRef.current;
    if (meta.featureId === null || meta.currentFolderId === folderId) return;
    meta.currentFolderId = folderId;
    const movedId = meta.featureId;
    setRawFeatures((prev) =>
      prev.map((item) => (item.id === movedId ? { ...item, folder_id: folderId } : item)),
    );
  };

  const beginDragFolder = (event: PointerEvent, folderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    dragMetaRef.current = {
      featureId: null,
      initialFolderId: "",
      currentFolderId: "",
      orderDirty: false,
      folderId,
      foldersDirty: false,
    };
    setDraggingFolderId(folderId);
  };

  const moveDraggedFolder = (targetFolderId: string) => {
    const meta = dragMetaRef.current;
    if (!meta.folderId || meta.folderId === targetFolderId) return;
    const current = foldersRef.current;
    const from = current.findIndex((f) => f.id === meta.folderId);
    const to = current.findIndex((f) => f.id === targetFolderId);
    if (from < 0 || to < 0) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    meta.foldersDirty = true;
    setFolders(next);
  };

  return {
    draggingFeatureId,
    draggingFolderId,
    beginDragFeature,
    moveDraggedFeature,
    moveDraggedFeatureToFolder,
    beginDragFolder,
    moveDraggedFolder,
  };
}
