import type { PointerEvent } from "react";
import type { UserFeature } from "../../../infrastructure/tauri";

export type MarkerFolder = { id: string; name: string; visible: boolean };

export type FeatureItemMenuState = {
  x: number;
  y: number;
  feature: UserFeature;
};

export type FeatureFolderMenuState = {
  x: number;
  y: number;
  folder: MarkerFolder;
};

export type MarkerPanelProps = {
  features: UserFeature[];
  folders: MarkerFolder[];
  open: boolean;
  expandedFolderIds: Set<string>;
  hiddenFeatureIds: number[];
  draggingFeatureId: number | null;
  draggingFolderId: string | null;
  exportMessage: string;
  onToggleOpen: () => void;
  onToggleFolder: (folder: MarkerFolder) => void;
  onToggleFolderExpanded: (id: string) => void;
  onRenameFolder: (folder: MarkerFolder) => void;
  onRemoveFolder: (folder: MarkerFolder) => void;
  onToggleFeatureVisibility: (id: number) => void;
  onOpenFeature: (feature: UserFeature) => void;
  onDeleteFeature: (feature: UserFeature) => void;
  onExportMeasurement: (feature: UserFeature) => void;
  onSetFeatureFolder: (feature: UserFeature, folderId: string) => void;
  onCreateFolderAndAssign: (name: string, feature: UserFeature) => void;
  onBeginDragFeature: (event: PointerEvent, featureId: number) => void;
  onMoveDraggedFeature: (targetFeatureId: number) => void;
  onMoveDraggedFeatureToFolder: (folderId: string) => void;
  onBeginDragFolder: (event: PointerEvent, folderId: string) => void;
  onMoveDraggedFolder: (targetFolderId: string) => void;
};
