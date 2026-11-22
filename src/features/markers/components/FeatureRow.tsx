import type { MouseEvent, PointerEvent } from "react";
import { Eye, EyeOff, GripVertical, MoreHorizontal } from "lucide-react";
import type { UserFeature } from "../../../infrastructure/tauri";

interface FeatureRowProps {
  feature: UserFeature;
  isHidden: boolean;
  isDragging: boolean;
  onBeginDrag: (event: PointerEvent, featureId: number) => void;
  onMoveDragged: (targetFeatureId: number) => void;
  onToggleVisibility: (id: number) => void;
  onOpenFeature: (feature: UserFeature) => void;
  onOpenMenu: (event: MouseEvent, feature: UserFeature) => void;
}

export function FeatureRow({
  feature,
  isHidden,
  isDragging,
  onBeginDrag,
  onMoveDragged,
  onToggleVisibility,
  onOpenFeature,
  onOpenMenu,
}: FeatureRowProps) {
  return (
    <div
      data-kb-row="true"
      data-kb-feature-id={feature.id}
      onPointerEnter={() => onMoveDragged(feature.id)}
      onContextMenu={(event) => onOpenMenu(event, feature)}
      className={`group flex items-center justify-between gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800/60 ${
        isDragging ? "bg-blue-100 ring-1 ring-blue-400 dark:bg-blue-900/60" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          onPointerDown={(event) => onBeginDrag(event, feature.id)}
          className={`touch-none text-slate-300 group-hover:text-slate-500 dark:text-zinc-600 dark:group-hover:text-zinc-400 ${
            isDragging ? "cursor-grabbing" : "cursor-grab"
          }`}
          title="Raahaa järjestyksen tai kansion vaihtamiseksi"
        >
          <GripVertical size={13} />
        </span>
        <button
          type="button"
          className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          title={isHidden ? "Näytä kartalla" : "Piilota kartalta"}
          aria-label={isHidden ? `Näytä ${feature.title} kartalla` : `Piilota ${feature.title} kartalta`}
          onClick={() => onToggleVisibility(feature.id)}
        >
          {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button
          type="button"
          className={`flex min-w-0 flex-1 items-center truncate pr-1 text-left text-xs ${
            isHidden ? "text-slate-400 dark:text-zinc-500" : "text-slate-700 dark:text-zinc-200"
          }`}
          onClick={() => onOpenFeature(feature)}
          title={feature.title}
        >
          <span className="truncate">{feature.title}</span>
        </button>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpenMenu(event, feature);
        }}
        className="shrink-0 rounded p-0.5 text-slate-400 opacity-60 transition-colors hover:bg-slate-200/70 hover:text-slate-700 group-hover:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
        title="Toiminnot ja ryhmät"
        aria-label={`Kohteen ${feature.title} toiminnot`}
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}
