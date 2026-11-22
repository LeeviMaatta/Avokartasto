import { Trash2, X } from "lucide-react";
import { formatArea, formatDistance } from "../domain/measurementFormatting";
import type { SelectedMeasurementItem } from "../domain/measurementSelection";
import { focusMapViewport, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";

interface MultiMeasurementBarProps {
  items: SelectedMeasurementItem[];
  units: string;
  areaUnit: string;
  opacity: number;
  onFocusSingle: (item: SelectedMeasurementItem) => void;
  onDeleteAll: () => void;
  onClose: () => void;
}

export function MultiMeasurementBar({
  items,
  units,
  areaUnit,
  opacity,
  onFocusSingle,
  onDeleteAll,
  onClose,
}: MultiMeasurementBarProps) {
  const distanceItems = items.filter((item) => item.kind === "distance");
  const areaItems = items.filter((item) => item.kind === "area");
  const totalDistance = distanceItems.reduce((sum, item) => sum + item.length, 0);
  const totalArea = areaItems.reduce((sum, item) => sum + item.length, 0);

  return (
    <div
      data-measure-tool="true"
      onKeyDown={(e) =>
        handleContainerArrowKeyDown(e, {
          orientation: "horizontal",
          onEscape: () => {
            onClose();
            focusMapViewport();
          },
        })
      }
      className="absolute left-2 right-2 top-16 sm:top-20 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs sm:text-sm text-slate-800 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 sm:left-1/2 sm:right-auto sm:max-w-[min(96vw,68rem)] sm:-translate-x-1/2 sm:gap-2.5 sm:px-4"
      style={{ opacity }}
    >
      <span className="whitespace-nowrap font-semibold text-slate-900 dark:text-white">
        {items.length} mittausta valittuna
      </span>
      {distanceItems.length > 0 && (
        <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium dark:bg-zinc-900">
          Yhteensä: <b className="text-slate-900 dark:text-white">{formatDistance(totalDistance, units)}</b>
        </span>
      )}
      {areaItems.length > 0 && (
        <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium dark:bg-zinc-900">
          Ala yhteensä: <b className="text-slate-900 dark:text-white">{formatArea(totalArea, areaUnit)}</b>
        </span>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {items.map((item, idx) => {
          const label = item.title
            ? `${item.title}: ${item.kind === "area" ? formatArea(item.length, areaUnit) : formatDistance(item.length, units)}`
            : `${idx + 1}. ${item.kind === "area" ? formatArea(item.length, areaUnit) : formatDistance(item.length, units)}`;
          return (
            <button
              key={item.savedId !== null ? `s-${item.savedId}` : `u-${item.unsavedId ?? idx}`}
              type="button"
              onClick={() => onFocusSingle(item)}
              className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition"
              title="Valitse vain tämä mittaus"
            >
              {label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onDeleteAll}
        className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-red-700 transition"
        title="Poista kaikki valitut mittaukset"
      >
        <Trash2 size={13} /> Poista valitut
      </button>
      <button
        type="button"
        onClick={onClose}
        title="Sulje valinta"
        aria-label="Sulje valinta"
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"
      >
        <X size={16} />
      </button>
    </div>
  );
}
