import { GripVertical } from "lucide-react";
import type { LayerListProps } from "../model/layerListTypes";

export default function LayerList({
  basemaps,
  overlays,
  basemap,
  activeOverlays,
  dragging,
  missing,
  onBeginDrag,
  onMoveDraggedLayer,
  onContextMenu,
  onSetBasemap,
  onToggleOverlay,
}: LayerListProps) {
  const renderLayer = (layer: typeof basemaps[number], role: "basemap" | "overlay", ids: string[]) => (
    <div
      key={layer.id}
      onPointerEnter={() => onMoveDraggedLayer(role, layer.id, ids)}
      onContextMenu={(event) => onContextMenu(event, layer.id, layer.name, role === "overlay", layer.source)}
      className={`flex items-center gap-2 rounded py-1 ${dragging?.kind === role && dragging.id === layer.id ? "bg-blue-100 ring-1 ring-blue-400 dark:bg-blue-900/60" : ""} ${missing(layer.needs) ? "opacity-40" : ""}`}
      title={missing(layer.needs) ? "Lisää API-avain asetuksissa" : layer.note}
    >
      <span onPointerDown={(event) => onBeginDrag(event, role, layer.id)} className={`touch-none text-slate-400 ${dragging?.id === layer.id ? "cursor-grabbing" : "cursor-grab"}`}>
        <GripVertical size={14} />
      </span>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
        <input type={role === "basemap" ? "radio" : "checkbox"} name={role === "basemap" ? "base" : undefined} checked={role === "basemap" ? basemap === layer.id : activeOverlays.includes(layer.id)} onChange={() => role === "basemap" ? onSetBasemap(layer.id) : onToggleOverlay(layer.id)} />
        <span className="truncate">{layer.name}</span>
        {layer.source?.is_default && <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">oletus</span>}
        {layer.source && !layer.source.is_default && <span className="rounded bg-blue-50 px-1 text-[10px] text-blue-600">tuotu</span>}
      </label>
    </div>
  );

  return (
    <div className="max-h-[35vh] overflow-y-auto border-t px-2 py-2 dark:border-gray-700 sm:px-3">
      <div className="mb-1 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Taustakartta</div>
      {basemaps.map((layer) => renderLayer(layer, "basemap", basemaps.map((item) => item.id)))}
      <div className="mb-1 mt-3 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Päällykset</div>
      {overlays.map((layer) => renderLayer(layer, "overlay", overlays.map((item) => item.id)))}
    </div>
  );
}
