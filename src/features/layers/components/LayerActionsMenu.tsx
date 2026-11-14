import type { RefObject } from "react";
import { handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";

interface LayerActionsMenuProps {
  actionMenu: { type: "layers"; x: number; y: number };
  actionMenuRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onSelectRole: (role: "basemap" | "overlay") => void;
}

export function LayerActionsMenu({
  actionMenu,
  actionMenuRef,
  onClose,
  onSelectRole,
}: LayerActionsMenuProps) {
  return (
    <div
      ref={actionMenuRef}
      role="menu"
      onKeyDown={(e) => handleContainerArrowKeyDown(e, { orientation: "both", onEscape: onClose })}
      className="fixed z-[70] max-h-[min(70vh,32rem)] w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-gray-800 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
      style={{ left: Math.max(8, actionMenu.x - 224), top: Math.min(actionMenu.y, window.innerHeight - 200) }}
    >
      <div className="mb-1 font-semibold text-gray-500 dark:text-zinc-400">Lisää uusi taso</div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          className="rounded border border-slate-300 px-2 py-1.5 hover:bg-slate-100 dark:border-gray-600 dark:hover:bg-gray-700 text-center font-medium"
          onClick={() => onSelectRole("basemap")}
        >
          Pohjakartta
        </button>
        <button
          className="rounded border border-slate-300 px-2 py-1.5 hover:bg-slate-100 dark:border-gray-600 dark:hover:bg-gray-700 text-center font-medium"
          onClick={() => onSelectRole("overlay")}
        >
          Päällyskartta
        </button>
      </div>
    </div>
  );
}
