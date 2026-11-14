import type { RefObject } from "react";
import { Check, ChevronDown, ChevronRight, Copy, EyeOff, Folder, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import type { LayerGroup } from "../model/layerListTypes";
import type { LayerContextMenuState } from "../hooks/useLayerCrud";

interface LayerContextMenuProps {
  menu: LayerContextMenuState;
  menuRef: RefObject<HTMLDivElement>;
  groups: LayerGroup[];
  layerGroupMap: Record<string, string>;
  groupsMenuOpen: boolean;
  newGroupModalOpen: boolean;
  newGroupName: string;
  onClose: () => void;
  onHideLayer: (id: string, role: "basemap" | "overlay") => void;
  onEditSource: () => void;
  onToggleGroupsMenu: () => void;
  onSetLayerGroup: (layerId: string, groupId: string | null) => void;
  onCreateGroup: (name: string, assignLayerId?: string, role?: "basemap" | "overlay") => void;
  onSetNewGroupModalOpen: (open: boolean) => void;
  onSetNewGroupName: (name: string) => void;
  onRemoveSource: () => void;
  onResetSource: () => void;
  onDuplicateSource: () => void;
}

export function LayerContextMenu({
  menu,
  menuRef,
  groups,
  layerGroupMap,
  groupsMenuOpen,
  newGroupModalOpen,
  newGroupName,
  onClose,
  onHideLayer,
  onEditSource,
  onToggleGroupsMenu,
  onSetLayerGroup,
  onCreateGroup,
  onSetNewGroupModalOpen,
  onSetNewGroupName,
  onRemoveSource,
  onResetSource,
  onDuplicateSource,
}: LayerContextMenuProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-[75] cursor-default"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        ref={menuRef}
        role="menu"
        onKeyDown={(e) => handleContainerArrowKeyDown(e, { onEscape: onClose })}
        className="fixed z-[80] min-w-48 max-w-64 overflow-hidden rounded-xl border border-slate-200 bg-white/95 py-1 text-xs text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100"
        style={{ left: menu.x, top: menu.y }}
      >
        <div className="px-3 py-1.5 font-semibold text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800/80 truncate">
          {menu.name}
        </div>

        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
          onClick={() => { onHideLayer(menu.id, menu.overlay ? "overlay" : "basemap"); onClose(); }}
        >
          <EyeOff size={14} className="text-slate-400 shrink-0" />
          <span>Piilota taso</span>
        </button>

        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
          onClick={onEditSource}
        >
          <Pencil size={14} className="text-slate-400 shrink-0" />
          <span>Muokkaa</span>
        </button>

        {/* Ryhmät alavalikko */}
        <div className="border-t border-slate-100 dark:border-zinc-800/80 my-0.5">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
            onClick={onToggleGroupsMenu}
          >
            <div className="flex items-center gap-2">
              <Folder size={14} className="text-amber-500 shrink-0" />
              <span className="font-medium">Ryhmät</span>
            </div>
            {groupsMenuOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
          </button>

          {groupsMenuOpen && (
            <div className="border-t border-slate-100 bg-slate-50/80 p-1 dark:border-zinc-800/80 dark:bg-zinc-900/60 space-y-0.5 max-h-48 overflow-y-auto">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left hover:bg-white dark:hover:bg-zinc-800 transition"
                onClick={() => onSetLayerGroup(menu.id, null)}
              >
                <span className={!layerGroupMap[menu.id] ? "font-semibold text-blue-600 dark:text-blue-400" : ""}>
                  Ei ryhmää
                </span>
                {!layerGroupMap[menu.id] && <Check size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />}
              </button>

              {groups
                .filter((group) => !group.role || group.role === (menu.overlay ? "overlay" : "basemap"))
                .map((group) => {
                  const isSelected = layerGroupMap[menu.id] === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left hover:bg-white dark:hover:bg-zinc-800 transition"
                      onClick={() => onSetLayerGroup(menu.id, group.id)}
                    >
                      <span className={`truncate ${isSelected ? "font-semibold text-blue-600 dark:text-blue-400" : ""}`}>
                        {group.name}
                      </span>
                      {isSelected && <Check size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />}
                    </button>
                  );
                })}

              <div className="border-t border-slate-200 dark:border-zinc-700/60 pt-1 mt-1">
                {newGroupModalOpen ? (
                  <div className="p-1 space-y-1.5">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Uuden ryhmän nimi"
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-900 text-slate-900 dark:text-white"
                      value={newGroupName}
                      onChange={(e) => onSetNewGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onCreateGroup(newGroupName, menu.id, menu.overlay ? "overlay" : "basemap");
                          onSetNewGroupName("");
                          onSetNewGroupModalOpen(false);
                        } else if (e.key === "Escape") {
                          onSetNewGroupModalOpen(false);
                        }
                      }}
                    />
                    <div className="flex gap-1 justify-end">
                      <button
                        type="button"
                        className="rounded px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-800"
                        onClick={() => onSetNewGroupModalOpen(false)}
                      >
                        Peruuta
                      </button>
                      <button
                        type="button"
                        className="rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700"
                        onClick={() => {
                          onCreateGroup(newGroupName, menu.id, menu.overlay ? "overlay" : "basemap");
                          onSetNewGroupName("");
                          onSetNewGroupModalOpen(false);
                        }}
                      >
                        Luo ryhmä
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 font-medium transition"
                    onClick={() => onSetNewGroupModalOpen(true)}
                  >
                    <Plus size={13} />
                    <span>Uusi ryhmä...</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {menu.source && !menu.source.is_default && (
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-600 hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
            onClick={onRemoveSource}
          >
            <Trash2 size={14} className="shrink-0" />
            <span>Poista</span>
          </button>
        )}
        {menu.source?.is_default && (
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
            onClick={onResetSource}
          >
            <RotateCcw size={14} className="text-slate-400 shrink-0" />
            <span>Palauta oletus</span>
          </button>
        )}
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
          onClick={onDuplicateSource}
        >
          <Copy size={14} className="text-slate-400 shrink-0" />
          <span>Monista</span>
        </button>
      </div>
    </>
  );
}
