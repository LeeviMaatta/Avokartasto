import { useEffect, useState, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import type { ApiType, SourceRole } from "../../../shared/types/sourceTypes";
import { BASEMAP_LAYER_TYPES, OVERLAY_LAYER_TYPES } from "../model/layerTypeConfig";

interface LayerActionsMenuProps {
  actionMenu: { type: "layers"; x: number; y: number };
  actionMenuRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onSelectRoleAndType: (role: SourceRole, apiType: ApiType) => void;
}

export function LayerActionsMenu({
  actionMenu,
  actionMenuRef,
  onClose,
  onSelectRoleAndType,
}: LayerActionsMenuProps) {
  const [selectedRole, setSelectedRole] = useState<SourceRole | null>(null);
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < 520);

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 520);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const typeOptions =
    selectedRole === "basemap"
      ? BASEMAP_LAYER_TYPES
      : selectedRole === "overlay"
        ? OVERLAY_LAYER_TYPES
        : [];

  const left = Math.max(8, Math.min(actionMenu.x - 160, window.innerWidth - (selectedRole && !isNarrow ? 420 : 210)));
  const top = Math.max(8, Math.min(actionMenu.y, window.innerHeight - 360));

  return (
    <div
      ref={actionMenuRef}
      role="menu"
      onKeyDown={(e) => handleContainerArrowKeyDown(e, { orientation: "both", onEscape: onClose })}
      className="fixed z-[70] flex items-start gap-1.5 text-xs text-gray-800 dark:text-white"
      style={{ left, top }}
    >
      {(!isNarrow || !selectedRole) && (
        <div className="w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-slate-100 px-3 py-1.5 text-[11px] font-semibold text-gray-500 dark:border-zinc-800 dark:text-zinc-400">
            Lisää uusi karttataso
          </div>
          <button
            type="button"
            className={`flex w-full items-center justify-between px-3 py-2 text-left font-medium transition ${
              selectedRole === "basemap"
                ? "bg-blue-50 text-[#1671a8] dark:bg-blue-950/50 dark:text-sky-400"
                : "hover:bg-slate-100 dark:hover:bg-zinc-800"
            }`}
            onClick={() => setSelectedRole("basemap")}
          >
            <span>Pohjakartta</span>
            <ChevronRight size={14} className="text-slate-400" />
          </button>
          <button
            type="button"
            className={`flex w-full items-center justify-between px-3 py-2 text-left font-medium transition ${
              selectedRole === "overlay"
                ? "bg-blue-50 text-[#1671a8] dark:bg-blue-950/50 dark:text-sky-400"
                : "hover:bg-slate-100 dark:hover:bg-zinc-800"
            }`}
            onClick={() => setSelectedRole("overlay")}
          >
            <span>Päällyskartta</span>
            <ChevronRight size={14} className="text-slate-400" />
          </button>
        </div>
      )}

      {selectedRole && (
        <div className="max-h-[min(70vh,28rem)] w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-1 border-b border-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 dark:border-zinc-800 dark:text-zinc-400">
            {isNarrow && (
              <button
                type="button"
                className="rounded p-0.5 hover:bg-slate-100 dark:hover:bg-zinc-800"
                onClick={() => setSelectedRole(null)}
                title="Takaisin"
              >
                <ChevronLeft size={14} />
              </button>
            )}
            <span>{selectedRole === "basemap" ? "Pohjakartta – tyyppi" : "Päällyskartta – tyyppi"}</span>
          </div>
          {typeOptions.map((opt) => (
            <button
              key={opt.apiType}
              type="button"
              className="flex w-full items-center justify-between px-3 py-1.5 text-left transition hover:bg-slate-100 dark:hover:bg-zinc-800"
              onClick={() => onSelectRoleAndType(selectedRole, opt.apiType)}
            >
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
