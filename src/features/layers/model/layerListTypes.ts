import type { MouseEvent, PointerEvent } from "react";
import type { LocalSource } from "../../../infrastructure/tauri";

export type LayerGroup = {
  id: string;
  name: string;
  role?: "basemap" | "overlay";
  hidden?: boolean;
};

export type HiddenLayerItem = {
  id: string;
  name: string;
  role: "basemap" | "overlay";
};

export type HiddenGroupItem = {
  id: string;
  name: string;
  role?: "basemap" | "overlay";
  count: number;
};

export type LayerListItem = {
  id: string;
  name: string;
  needs?: string;
  note?: string;
  source?: LocalSource;
};

export type LayerListProps = {
  basemaps: LayerListItem[];
  overlays: LayerListItem[];
  hiddenLayers?: HiddenLayerItem[];
  hiddenGroups?: HiddenGroupItem[];
  groups?: LayerGroup[];
  layerGroupMap?: Record<string, string>;
  basemap: string;
  activeOverlays: string[];
  dragging: { kind: "overlay" | "basemap"; id: string } | null;
  draggingGroup?: { role: "overlay" | "basemap"; id: string } | null;
  missing: (needs?: string) => boolean | undefined;
  onBeginDrag: (event: PointerEvent, kind: "overlay" | "basemap", id: string) => void;
  onMoveDraggedLayer: (kind: "overlay" | "basemap", targetId: string, ids: string[]) => void;
  onBeginDragGroup?: (event: PointerEvent, role: "overlay" | "basemap", groupId: string) => void;
  onMoveDraggedGroup?: (role: "overlay" | "basemap", targetGroupId: string, ids: string[]) => void;
  onMoveDraggedGroupOverLayer?: (role: "overlay" | "basemap", targetLayerId: string, ids: string[]) => void;
  onMoveLayerOverGroup?: (role: "overlay" | "basemap", targetGroupId: string, ids: string[]) => void;
  onContextMenu: (event: MouseEvent, id: string, name: string, overlay: boolean, source?: LocalSource) => void;
  onOpenMenu: (event: MouseEvent, id: string, name: string, overlay: boolean, source?: LocalSource) => void;
  onOpenGroupMenu?: (event: MouseEvent, groupId: string, groupName: string) => void;
  onRestoreLayer?: (id: string, role: "basemap" | "overlay") => void;
  onRestoreGroup?: (groupId: string) => void;
  onSetBasemap: (id: string) => void;
  onToggleOverlay: (id: string) => void;
};
