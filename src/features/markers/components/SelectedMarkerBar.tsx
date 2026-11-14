import { MapPin, Pencil, Trash2, X } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { focusMapViewport, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import type { SelectedFeature } from "../../map/model/mapTypes";

interface SelectedMarkerBarProps {
  selectedFeature: SelectedFeature;
  savedMarkerColor: string;
  overlayOpacity: number;
  onEdit: () => void;
  onDelete: () => void;
}

export function SelectedMarkerBar({
  selectedFeature,
  savedMarkerColor,
  overlayOpacity,
  onEdit,
  onDelete,
}: SelectedMarkerBarProps) {
  return (
    <div
      onKeyDown={(e) =>
        handleContainerArrowKeyDown(e, {
          orientation: "horizontal",
          onEscape: () => {
            useMapStore.setState({ selectedFeature: null });
            focusMapViewport();
          },
        })
      }
      className="absolute left-2 right-2 top-16 sm:top-20 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs sm:text-sm text-slate-800 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:flex-nowrap sm:px-4"
      style={{ opacity: overlayOpacity }}
    >
      <span className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
        <MapPin size={16} style={{ color: savedMarkerColor }} /> Merkki
      </span>
      <span className="max-w-48 truncate font-medium">{selectedFeature.title}</span>
      <button
        className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800 transition"
        onClick={onEdit}
      >
        <Pencil size={13} /> Muokkaa
      </button>
      <button
        className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/60 transition"
        onClick={onDelete}
        title="Poista merkki (Delete)"
      >
        <Trash2 size={13} /> <span>Poista</span>
      </button>
      <button
        onClick={() => useMapStore.setState({ selectedFeature: null })}
        title="Sulje"
        aria-label="Sulje"
        className="rounded p-1 hover:bg-slate-100 dark:hover:bg-zinc-800"
      >
        <X size={16} />
      </button>
    </div>
  );
}
