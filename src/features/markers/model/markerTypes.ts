import type { UserFeature } from "../../../infrastructure/tauriBridge";

export type MarkerFolder = { id: string; name: string; visible: boolean };

export type MarkerPanelProps = {
  features: UserFeature[];
  folders: MarkerFolder[];
  open: boolean;
  folderMenuOpen: boolean;
  expandedFolderIds: Set<string>;
  folderDraft: string;
  hiddenFeatureIds: number[];
  onToggleOpen: () => void;
  onToggleFolderMenu: () => void;
  onFolderDraftChange: (value: string) => void;
  onAddFolder: () => void;
  onToggleFolder: (folder: MarkerFolder) => void;
  onToggleFolderExpanded: (id: string) => void;
  onRenameFolder: (folder: MarkerFolder) => void;
  onRemoveFolder: (folder: MarkerFolder) => void;
  onToggleFeatureVisibility: (id: number) => void;
  onOpenFeature: (feature: UserFeature) => void;
  onDeleteFeature: (feature: UserFeature) => void;
};
