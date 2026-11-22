import { useEffect, type RefObject } from "react";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { focusFirstNavigable, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import type { FeatureFolderMenuState, MarkerFolder } from "../model/markerTypes";

interface FeatureFolderContextMenuProps {
  menu: FeatureFolderMenuState;
  menuRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onToggleVisibility: (folder: MarkerFolder) => void;
  onRename: (folder: MarkerFolder) => void;
  onDelete: (folder: MarkerFolder) => void;
}

export function FeatureFolderContextMenu({
  menu,
  menuRef,
  onClose,
  onToggleVisibility,
  onRename,
  onDelete,
}: FeatureFolderContextMenuProps) {
  useEffect(() => {
    window.requestAnimationFrame(() => focusFirstNavigable(menuRef.current));
  }, [menu, menuRef]);

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
        className="fixed z-[80] min-w-44 max-w-60 rounded-xl border border-slate-200 bg-white/95 py-1 text-xs text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100"
        style={{ left: menu.x, top: menu.y }}
      >
        <div className="truncate border-b border-slate-100 px-3 py-1.5 font-semibold text-slate-500 dark:border-zinc-800/80 dark:text-zinc-400">
          {menu.folder.name}
        </div>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-zinc-800/70"
          onClick={() => {
            onToggleVisibility(menu.folder);
            onClose();
          }}
        >
          {menu.folder.visible ? <EyeOff size={14} className="shrink-0 text-slate-400" /> : <Eye size={14} className="shrink-0 text-slate-400" />}
          <span>{menu.folder.visible ? "Piilota ryhmä" : "Näytä ryhmä"}</span>
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-zinc-800/70"
          onClick={() => {
            onRename(menu.folder);
            onClose();
          }}
        >
          <Pencil size={14} className="shrink-0 text-slate-400" />
          <span>Muokkaa</span>
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          onClick={() => {
            onDelete(menu.folder);
            onClose();
          }}
        >
          <Trash2 size={14} className="shrink-0" />
          <span>Poista ryhmä</span>
        </button>
      </div>
    </>
  );
}
