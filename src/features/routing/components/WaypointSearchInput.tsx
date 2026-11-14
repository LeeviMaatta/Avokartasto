import { Crosshair, Loader2, MapPin, X } from "lucide-react";
import { focusFirstNavigable, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import type { NominatimSearchHit } from "../../search/services/nominatimService";
import type { MarkerSearchHit } from "../../markers/domain/markerSearch";

interface WaypointSearchInputProps {
  idx: number;
  totalPoints: number;
  hasPoint: boolean;
  value: string;
  isPicking: boolean;
  isActiveSearch: boolean;
  searching: boolean;
  markerHits: MarkerSearchHit[];
  searchResults: NominatimSearchHit[];
  savedMarkerColor: string;
  onInputChange: (idx: number, value: string) => void;
  onRunSearch: (idx: number, text: string) => void;
  onTogglePick: (idx: number) => void;
  onRemovePoint: (idx: number) => void;
  onClearSearchDropdown: () => void;
  onSelectMarkerHit: (idx: number, hit: MarkerSearchHit) => void;
  onSelectSearchHit: (idx: number, hit: NominatimSearchHit) => void;
}

function getPointBadge(idx: number, totalPoints: number) {
  if (idx === 0) return { text: "A", cls: "bg-emerald-600 text-white" };
  if (idx === totalPoints - 1) return { text: "B", cls: "bg-red-600 text-white" };
  return { text: String(idx), cls: "bg-blue-600 text-white" };
}

export function WaypointSearchInput({
  idx,
  totalPoints,
  hasPoint,
  value,
  isPicking,
  isActiveSearch,
  searching,
  markerHits,
  searchResults,
  savedMarkerColor,
  onInputChange,
  onRunSearch,
  onTogglePick,
  onRemovePoint,
  onClearSearchDropdown,
  onSelectMarkerHit,
  onSelectSearchHit,
}: WaypointSearchInputProps) {
  const badge = getPointBadge(idx, totalPoints);
  const showDropdown = isActiveSearch && (markerHits.length > 0 || searchResults.length > 0 || searching);

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${badge.cls}`}>
          {badge.text}
        </span>
        <input
          type="text"
          value={value}
          placeholder={
            idx === 0
              ? "Lähtöpiste (hae tai klikkaa karttaa)"
              : idx === totalPoints - 1
              ? "Määränpää (hae tai klikkaa karttaa)"
              : "Välietappi"
          }
          onChange={(e) => onInputChange(idx, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRunSearch(idx, value);
            if (e.key === "ArrowDown" && isActiveSearch) {
              const resultsEl = e.currentTarget.closest(".space-y-1.5, div")?.parentElement?.querySelector<HTMLElement>(
                `[data-route-results="${idx}"]`,
              );
              if (resultsEl) {
                e.preventDefault();
                e.stopPropagation();
                focusFirstNavigable(resultsEl);
              }
            }
            if (e.key === "Escape" && isActiveSearch) {
              e.preventDefault();
              e.stopPropagation();
              onClearSearchDropdown();
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={() => onTogglePick(idx)}
          className={`rounded-lg border p-1.5 transition shrink-0 ${
            isPicking
              ? "border-blue-500 bg-blue-600 text-white"
              : "border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
          title="Valitse piste klikkaamalla karttaa"
        >
          <Crosshair size={13} />
        </button>
        {(hasPoint || totalPoints > 2) && (
          <button
            type="button"
            onClick={() => onRemovePoint(idx)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-zinc-800 transition shrink-0"
            title={totalPoints > 2 ? "Poista piste" : "Tyhjennä piste"}
          >
            <X size={13} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          data-route-results={idx}
          onKeyDown={(e) => handleContainerArrowKeyDown(e, { onEscape: onClearSearchDropdown })}
          className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="max-h-40 overflow-y-auto">
            {searching && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-slate-500">
                <Loader2 size={12} className="animate-spin" /> Haetaan...
              </div>
            )}
            {markerHits.map((hit) => (
              <button
                key={`marker:${hit.id}`}
                type="button"
                onClick={() => onSelectMarkerHit(idx, hit)}
                className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-1.5 text-left text-[11px] hover:bg-slate-100 last:border-b-0 dark:border-zinc-800 dark:hover:bg-zinc-800"
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <MapPin size={12} className="shrink-0" style={{ color: savedMarkerColor }} />
                  <span className="truncate font-medium">{hit.title}</span>
                </div>
                <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                  Merkki
                </span>
              </button>
            ))}
            {searchResults.map((hit, i) => (
              <button
                key={`${hit.lat}-${hit.lon}-${i}`}
                type="button"
                onClick={() => onSelectSearchHit(idx, hit)}
                className="block w-full border-b border-slate-100 px-2.5 py-1.5 text-left text-[11px] hover:bg-slate-100 last:border-b-0 dark:border-zinc-800 dark:hover:bg-zinc-800"
              >
                <div className="truncate">{hit.display_name}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
