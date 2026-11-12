import type { MouseEvent, PointerEvent } from "react";
import type { LocalSource } from "../../../infrastructure/tauriBridge";

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
  basemap: string;
  activeOverlays: string[];
  dragging: { kind: "overlay" | "basemap"; id: string } | null;
  missing: (needs?: string) => boolean | undefined;
  onBeginDrag: (event: PointerEvent, kind: "overlay" | "basemap", id: string) => void;
  onMoveDraggedLayer: (kind: "overlay" | "basemap", targetId: string, ids: string[]) => void;
  onContextMenu: (event: MouseEvent, id: string, name: string, overlay: boolean, source?: LocalSource) => void;
  onSetBasemap: (id: string) => void;
  onToggleOverlay: (id: string) => void;
};
