import { useEffect, useState, type RefObject } from "react";
import { Check, ChevronDown, ChevronRight, Download, Eye, EyeOff, Folder, Pencil, Plus, Trash2 } from "lucide-react";
import { focusFirstNavigable, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import type { UserFeature } from "../../../infrastructure/tauri";
import type { FeatureItemMenuState, MarkerFolder } from "../model/markerTypes";

interface FeatureItemContextMenuProps {
  menu: FeatureItemMenuState;
  menuRef: RefObject<HTMLDivElement>;
  folders: MarkerFolder[];
  isHidden: boolean;
  onClose: () => void;
  onToggleVisibility: (id: number) => void;
  onEdit: (feature: UserFeature) => void;
  onExport: (feature: UserFeature) => void;
  onSetFolder: (feature: UserFeature, folderId: string) => void;
  onCreateFolder: (name: string, feature: UserFeature) => void;
  onDelete: (feature: UserFeature) => void;
}

export function FeatureItemContextMenu({
  menu,
  menuRef,
  folders,
  isHidden,
  onClose,
  onToggleVisibility,
  onEdit,
  onExport,
  onSetFolder,
  onCreateFolder,
  onDelete,
}: FeatureItemContextMenuProps) {
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const { feature } = menu;
  const currentFolderId = feature.folder_id ?? "";
  const isMeasurement = feature.feature_type !== "POINT";

  useEffect(() => {
    setGroupsOpen(false);
    setNewGroupOpen(false);
    setNewGroupName("");
    window.requestAnimationFrame(() => focusFirstNavigable(menuRef.current));
  }, [menu, menuRef]);

  const submitNewGroup = () => {
    if (!newGroupName.trim()) return;
    onCreateFolder(newGroupName, feature);
    setNewGroupName("");
    setNewGroupOpen(false);
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[75] cursor-default"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        onKeyDown={(event) => handleContainerArrowKeyDown(event, { onEscape: onClose })}
        className="fixed z-[80] min-w-48 max-w-64 overflow-hidden rounded-xl border border-slate-200 bg-white/95 py-1 text-xs text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100"
        style={{ left: menu.x, top: menu.y }}
      >
        <div className="truncate border-b border-slate-100 px-3 py-1.5 font-semibold text-slate-500 dark:border-zinc-800/80 dark:text-zinc-400">
          {feature.title}
        </div>

        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-zinc-800/70"
          onClick={() => {
            onToggleVisibility(feature.id);
            onClose();
          }}
        >
          {isHidden ? <Eye size={14} className="shrink-0 text-slate-400" /> : <EyeOff size={14} className="shrink-0 text-slate-400" />}
          <span>{isHidden ? "Näytä" : "Piilota"}</span>
        </button>

        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-zinc-800/70"
          onClick={() => {
            onEdit(feature);
            onClose();
          }}
        >
          <Pencil size={14} className="shrink-0 text-slate-400" />
          <span>Muokkaa</span>
        </button>

        {isMeasurement && (
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-zinc-800/70"
            onClick={() => {
              onExport(feature);
              onClose();
            }}
          >
            <Download size={14} className="shrink-0 text-slate-400" />
            <span>Vie</span>
          </button>
        )}

        <div className="my-0.5 border-t border-slate-100 dark:border-zinc-800/80">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-zinc-800/70"
            onClick={() => setGroupsOpen((prev) => !prev)}
          >
            <div className="flex items-center gap-2">
              <Folder size={14} className="shrink-0 text-amber-500" />
              <span className="font-medium">Ryhmät</span>
            </div>
            {groupsOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
          </button>

          {groupsOpen && (
            <div className="max-h-48 space-y-0.5 overflow-y-auto border-t border-slate-100 bg-slate-50/80 p-1 dark:border-zinc-800/80 dark:bg-zinc-900/60">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left transition hover:bg-white dark:hover:bg-zinc-800"
                onClick={() => {
                  onSetFolder(feature, "");
                  onClose();
                }}
              >
                <span className={!currentFolderId ? "font-semibold text-blue-600 dark:text-blue-400" : ""}>Ei ryhmää</span>
                {!currentFolderId && <Check size={13} className="shrink-0 text-blue-600 dark:text-blue-400" />}
              </button>

              {folders.map((folder) => {
                const isSelected = currentFolderId === folder.id;
                return (
                  <button
                    key={folder.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left transition hover:bg-white dark:hover:bg-zinc-800"
                    onClick={() => {
                      onSetFolder(feature, folder.id);
                      onClose();
                    }}
                  >
                    <span className={`truncate ${isSelected ? "font-semibold text-blue-600 dark:text-blue-400" : ""}`}>
                      {folder.name}
                    </span>
                    {isSelected && <Check size={13} className="shrink-0 text-blue-600 dark:text-blue-400" />}
                  </button>
                );
              })}

              <div className="mt-1 border-t border-slate-200 pt-1 dark:border-zinc-700/60">
                {newGroupOpen ? (
                  <div className="space-y-1.5 p-1">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Uuden ryhmän nimi"
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                      value={newGroupName}
                      onChange={(event) => setNewGroupName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          submitNewGroup();
                        } else if (event.key === "Escape") {
                          event.stopPropagation();
                          setNewGroupOpen(false);
                        }
                      }}
                    />
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="rounded px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-800"
                        onClick={() => setNewGroupOpen(false)}
                      >
                        Peruuta
                      </button>
                      <button
                        type="button"
                        className="rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700"
                        onClick={submitNewGroup}
                      >
                        Luo ryhmä
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left font-medium text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                    onClick={() => setNewGroupOpen(true)}
                  >
                    <Plus size={13} />
                    <span>Uusi ryhmä...</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          onClick={() => {
            onDelete(feature);
            onClose();
          }}
        >
          <Trash2 size={14} className="shrink-0" />
          <span>Poista</span>
        </button>
      </div>
    </>
  );
}
