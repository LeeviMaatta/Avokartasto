import { GripVertical, ChevronDown, ChevronRight, MoreHorizontal, Folder, Eye, EyeOff } from "lucide-react";
import { usePersistedBool, usePersistedStringSet } from "../../settings/model/persistedUiState";
import type { LayerListProps } from "../model/layerListTypes";

export default function LayerList({
  basemaps,
  overlays,
  hiddenLayers = [],
  hiddenGroups = [],
  groups = [],
  layerGroupMap = {},
  basemap,
  activeOverlays,
  dragging,
  draggingGroup = null,
  missing,
  onBeginDrag,
  onMoveDraggedLayer,
  onBeginDragGroup,
  onMoveDraggedGroup,
  onMoveDraggedGroupOverLayer,
  onMoveLayerOverGroup,
  onContextMenu,
  onOpenMenu,
  onOpenGroupMenu,
  onRestoreLayer,
  onRestoreGroup,
  onSetBasemap,
  onToggleOverlay,
}: LayerListProps) {
  const [expandedBasemaps, toggleBasemaps] = usePersistedBool("layerListExpandedBasemaps", true);
  const [expandedOverlays, toggleOverlays] = usePersistedBool("layerListExpandedOverlays", true);
  const [expandedHidden, toggleHidden] = usePersistedBool("layerListExpandedHidden", true);
  const [expandedGroupIds, toggleGroupExpanded] = usePersistedStringSet("layerListCollapsedGroups");

  const renderLayer = (layer: typeof basemaps[number], role: "basemap" | "overlay", ids: string[]) => (
    <div
      key={layer.id}
      onPointerEnter={() => {
        if (draggingGroup && draggingGroup.role === role) {
          onMoveDraggedGroupOverLayer?.(role, layer.id, ids);
        } else {
          onMoveDraggedLayer(role, layer.id, ids);
        }
      }}
      onContextMenu={(event) => onContextMenu(event, layer.id, layer.name, role === "overlay", layer.source)}
      className={`group flex items-center justify-between gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800/60 ${
        dragging?.kind === role && dragging.id === layer.id
          ? "bg-blue-100 ring-1 ring-blue-400 dark:bg-blue-900/60"
          : ""
      } ${missing(layer.needs) ? "opacity-45" : ""}`}
      title={missing(layer.needs) ? "Lisää API-avain asetuksissa" : layer.note}
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

  const renderLayerSection = (items: typeof basemaps, role: "basemap" | "overlay") => {
    const allIds = items.map((i) => i.id);
    const activeGroupMap = new Map((groups || []).filter((grp) => !grp.hidden).map((grp) => [grp.id, grp]));
    const renderedGroupIds = new Set<string>();
    const entries: Array<
      | { type: "group"; group: typeof groups[number]; layers: typeof basemaps }
      | { type: "layer"; layer: typeof basemaps[number] }
    > = [];

    for (const item of items) {
      const gid = layerGroupMap?.[item.id];
      const grp = gid ? activeGroupMap.get(gid) : undefined;
      if (grp) {
        if (!renderedGroupIds.has(grp.id)) {
          renderedGroupIds.add(grp.id);
          entries.push({
            type: "group",
            group: grp,
            layers: items.filter((l) => layerGroupMap?.[l.id] === grp.id),
          });
        }
      } else {
        entries.push({ type: "layer", layer: item });
      }
    }

    return (
      <div className="space-y-0.5 pt-0.5">
        {entries.map((entry) => {
          if (entry.type === "layer") {
            return renderLayer(entry.layer, role, allIds);
          }
          const { group, layers } = entry;
          const isGrpExpanded = !expandedGroupIds.has(group.id);
          const isDraggingThisGroup = draggingGroup?.role === role && draggingGroup.id === group.id;
          return (
            <div
              key={group.id}
              onPointerEnter={() => {
                if (draggingGroup && draggingGroup.role === role) {
                  onMoveDraggedGroup?.(role, group.id, allIds);
                } else if (dragging && dragging.kind === role) {
                  onMoveLayerOverGroup?.(role, group.id, allIds);
                }
              }}
              className={`mt-1 rounded-md border p-1 transition-colors ${
                isDraggingThisGroup
                  ? "border-blue-400 bg-blue-50/70 ring-1 ring-blue-400 dark:border-blue-500 dark:bg-blue-950/40"
                  : "border-slate-100 bg-slate-50/50 dark:border-zinc-800/80 dark:bg-zinc-900/30"
              }`}
            >
              <div className="group/grp flex items-center justify-between gap-1 px-1 py-0.5 text-[11px] font-medium text-slate-600 dark:text-zinc-300">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  {onBeginDragGroup && (
                    <span
                      onPointerDown={(event) => onBeginDragGroup(event, role, group.id)}
                      className={`touch-none text-slate-300 hover:text-slate-500 dark:text-zinc-600 dark:group-hover/grp:text-zinc-400 ${
                        isDraggingThisGroup ? "cursor-grabbing" : "cursor-grab"
                      }`}
                      title="Raahaa ryhmän järjestyksen muuttamiseksi"
                    >
                      <GripVertical size={13} />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleGroupExpanded(group.id)}
                    className="flex min-w-0 flex-1 items-center gap-1.5 hover:text-slate-900 dark:hover:text-white text-left"
                  >
                    {isGrpExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <Folder size={13} className="text-amber-500 shrink-0" />
                    <span className="truncate">{group.name}</span>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500">({layers.length})</span>
                  </button>
                </div>
                {onOpenGroupMenu && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenGroupMenu(e, group.id, group.name);
                    }}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 transition-colors opacity-60 group-hover/grp:opacity-100 shrink-0"
                    title={`Ryhmän "${group.name}" toiminnot`}
                    aria-label={`Ryhmän ${group.name} toiminnot`}
                  >
                    <MoreHorizontal size={13} />
                  </button>
                )}
              </div>
              {isGrpExpanded && (
                <div className="space-y-0.5 pl-2 pt-0.5 border-l border-slate-200 ml-1.5 dark:border-zinc-700">
                  {layers.map((layer) => renderLayer(layer, role, allIds))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="max-h-[50vh] overflow-y-auto rounded-b-lg border-t border-slate-100 px-2 py-2 dark:border-zinc-800 sm:px-3">
      {/* Taustakartat alaotsikko */}
      <div className="mb-1">
        <button
          type="button"
          onClick={toggleBasemaps}
          className="flex w-full items-center justify-between py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <div className="flex items-center gap-1">
            {expandedBasemaps ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Taustakartat</span>
          </div>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
            {basemaps.length}
          </span>
        </button>
        {expandedBasemaps && renderLayerSection(basemaps, "basemap")}
      </div>

      {/* Päällykset alaotsikko */}
      <div className="mt-2 border-t border-slate-100 pt-1.5 dark:border-zinc-800/60">
        <button
          type="button"
          onClick={toggleOverlays}
          className="flex w-full items-center justify-between py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <div className="flex items-center gap-1">
            {expandedOverlays ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Päällyskartat</span>
          </div>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
            {overlays.length}
          </span>
        </button>
        {expandedOverlays && (
          overlays.length === 0 ? (
            <div className="px-2 py-1 text-[11px] text-slate-400 dark:text-zinc-500 italic">
              Ei päällyskarttoja
            </div>
          ) : (
            renderLayerSection(overlays, "overlay")
          )
        )}
      </div>

      {/* Piilotetut kartat alaotsikko */}
      {(hiddenLayers.length > 0 || hiddenGroups.length > 0) && (
        <div className="mt-2 border-t border-slate-100 pt-1.5 dark:border-zinc-800/60">
          <button
            type="button"
            onClick={toggleHidden}
            className="flex w-full items-center justify-between py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300"
          >
            <div className="flex items-center gap-1">
              {expandedHidden ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <EyeOff size={13} className="shrink-0" />
              <span>Piilotetut kartat</span>
            </div>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
              {hiddenLayers.length + hiddenGroups.length}
            </span>
          </button>
          {expandedHidden && (
            <div className="space-y-0.5 pt-0.5">
              {hiddenGroups.map((grp) => (
                <div
                  key={grp.id}
                  className="group flex items-center justify-between gap-1.5 rounded-md px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Folder size={13} className="text-amber-500/80 shrink-0" />
                    <span className="truncate">{grp.name}</span>
                    {grp.role && (
                      <span className="rounded bg-slate-100 px-1 py-0.2 text-[9px] text-slate-500 dark:bg-zinc-800 dark:text-zinc-400 shrink-0">
                        {grp.role === "basemap" ? "Tausta" : "Päällyke"}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500">({grp.count})</span>
                  </div>
                  {onRestoreGroup && (
                    <button
                      type="button"
                      onClick={() => onRestoreGroup(grp.id)}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/50 transition-colors shrink-0"
                      title="Palauta ryhmä ja sen tasot näkyviin"
                    >
                      <Eye size={12} />
                      <span>Palauta</span>
                    </button>
                  )}
                </div>
              ))}
              {hiddenLayers.map((layer) => (
                <div
                  key={layer.id}
                  className="group flex items-center justify-between gap-1.5 rounded-md px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <span className="truncate">{layer.name}</span>
                  {onRestoreLayer && (
                    <button
                      type="button"
                      onClick={() => onRestoreLayer(layer.id, layer.role)}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/50 transition-colors shrink-0"
                      title="Palauta karttataso näkyviin"
                    >
                      <Eye size={12} />
                      <span>Palauta</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
