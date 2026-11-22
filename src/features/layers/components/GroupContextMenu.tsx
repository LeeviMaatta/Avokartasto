import type { RefObject } from "react";
import { EyeOff, Trash2 } from "lucide-react";
import { handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";

interface GroupContextMenuProps {
  groupMenu: { x: number; y: number; id: string; name: string };
  groupMenuRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onHideGroup: (id: string) => void;
  onDeleteGroup: (id: string) => void;
}

export function GroupContextMenu({
  groupMenu,
  groupMenuRef,
  onClose,
  onHideGroup,
  onDeleteGroup,
}: GroupContextMenuProps) {
  return (
    <>
      <div
        className="fixed inset-0 z-[75] cursor-default"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div
        ref={groupMenuRef}
        role="menu"
        onKeyDown={(e) => handleContainerArrowKeyDown(e, { onEscape: onClose })}
        className="fixed z-[80] min-w-44 max-w-60 rounded-xl border border-slate-200 bg-white/95 py-1 text-xs text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100"
        style={{ left: groupMenu.x, top: groupMenu.y }}
      >
        <div className="px-3 py-1.5 font-semibold text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800/80 truncate">
          {groupMenu.name}
        </div>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
          onClick={() => onHideGroup(groupMenu.id)}
        >
          <EyeOff size={14} className="text-slate-400 shrink-0" />
          <span>Piilota ryhmä</span>
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 transition"
          onClick={() => onDeleteGroup(groupMenu.id)}
        >
          <Trash2 size={14} className="shrink-0" />
          <span>Poista ryhmä</span>
        </button>
      </div>
    </>
  );
}
