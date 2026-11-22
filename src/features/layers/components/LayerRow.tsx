import type { MouseEvent, PointerEvent } from "react";
import { GripVertical, MoreHorizontal } from "lucide-react";
import type { LocalSource } from "../../../infrastructure/tauri";
import type { LayerListItem } from "../model/layerListTypes";

interface LayerRowProps {
  layer: LayerListItem;
  role: "basemap" | "overlay";
  allIds: string[];
  basemap: string;
  activeOverlays: string[];
  dragging: { kind: "overlay" | "basemap"; id: string } | null;
  draggingGroup: { role: "overlay" | "basemap"; id: string } | null;
  missing: (needs?: string) => boolean | undefined;
  onBeginDrag: (event: PointerEvent, kind: "overlay" | "basemap", id: string) => void;
  onMoveDraggedLayer: (kind: "overlay" | "basemap", targetId: string, ids: string[]) => void;
  onMoveDraggedGroupOverLayer?: (role: "overlay" | "basemap", targetLayerId: string, ids: string[]) => void;
  onContextMenu: (event: MouseEvent, id: string, name: string, overlay: boolean, source?: LocalSource) => void;
  onOpenMenu: (event: MouseEvent, id: string, name: string, overlay: boolean, source?: LocalSource) => void;
  onSetBasemap: (id: string) => void;
  onToggleOverlay: (id: string) => void;
}

export function LayerRow({
  layer,
  role,
  allIds,
  basemap,
  activeOverlays,
  dragging,
  draggingGroup,
  missing,
  onBeginDrag,
  onMoveDraggedLayer,
  onMoveDraggedGroupOverLayer,
  onContextMenu,
  onOpenMenu,
  onSetBasemap,
  onToggleOverlay,
}: LayerRowProps) {
  return (
    <div
      data-kb-row="true"
      onPointerEnter={() => {
        if (draggingGroup && draggingGroup.role === role) {
          onMoveDraggedGroupOverLayer?.(role, layer.id, allIds);
        } else {
          onMoveDraggedLayer(role, layer.id, allIds);
        }
      }}
      onContextMenu={(event) => onContextMenu(event, layer.id, layer.name, role === "overlay", layer.source)}
      className={`group flex items-center justify-between gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800/60 ${
        dragging?.kind === role && dragging.id === layer.id
          ? "bg-blue-100 ring-1 ring-blue-400 dark:bg-blue-900/60"
          : ""
      } ${missing(layer.needs) || (layer.source && !layer.source.url.trim() && !layer.source.base_path.trim()) ? "opacity-45" : ""}`}
      title={
        missing(layer.needs)
          ? "Lisää API-avain asetuksissa"
          : layer.source && !layer.source.url.trim() && !layer.source.base_path.trim()
          ? "Lisää URL-osoite tason muokkauksesta"
          : layer.note
      }
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          onPointerDown={(event) => onBeginDrag(event, role, layer.id)}
          className={`touch-none text-slate-300 group-hover:text-slate-500 dark:text-zinc-600 dark:group-hover:text-zinc-400 ${
            dragging?.id === layer.id ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          <GripVertical size={14} />
        </span>
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
          <input
            type={role === "basemap" ? "radio" : "checkbox"}
            name={role === "basemap" ? "base" : undefined}
            checked={role === "basemap" ? basemap === layer.id : activeOverlays.includes(layer.id)}
            onChange={() => (role === "basemap" ? onSetBasemap(layer.id) : onToggleOverlay(layer.id))}
            className="h-3.5 w-3.5 rounded accent-blue-600"
          />
          <span className="truncate text-xs text-slate-700 dark:text-zinc-200">{layer.name}</span>
        </label>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenMenu(event, layer.id, layer.name, role === "overlay", layer.source);
        }}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 transition-colors opacity-60 group-hover:opacity-100 shrink-0"
        title="Karttatason toiminnot ja ryhmät"
        aria-label={`Karttatason ${layer.name} toiminnot`}
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}
