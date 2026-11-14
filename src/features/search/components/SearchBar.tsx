import { Search, X, Loader2, MapPin } from "lucide-react";
import { useEffect, useRef } from "react";
import { useMapStore } from "../../../store/mapStore";
import type { NominatimSearchHit } from "../services/nominatimService";
import type { MarkerSearchHit } from "../../markers/domain/markerSearch";
import { focusMapViewport, getNavigableItems } from "../../../shared/keyboardNavigation";
import { usePlaceSearch } from "../hooks/usePlaceSearch";

export default function SearchBar() {
  const {
    query,
    setQuery,
    results,
    markerResults,
    loading,
    error,
    search,
    clearResults,
    resetSearch,
  } = usePlaceSearch();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const rawOverlayOpacity = Number(useMapStore((s) => s.settings.uiOverlayOpacity ?? "1"));
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;
  const savedMarkerColor = useMapStore((s) => s.settings.savedMarkerColor ?? "#dc2626");

  // Close search results on outside click, Escape, or keyboard shortcut focus event
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        clearResults();
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        clearResults();
      }
    };
    const onFocusSearch = () => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    };
    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("kb-focus-search", onFocusSearch);
    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("kb-focus-search", onFocusSearch);
    };
  }, [clearResults]);

  const select = (result: NominatimSearchHit) => {
    const lat = Number(result.lat);
    const lon = Number(result.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    window.dispatchEvent(new CustomEvent("map-search-location", { detail: { lat, lon } }));
    setQuery(result.display_name);
    clearResults();
  };

  const selectMarker = (hit: MarkerSearchHit) => {
    window.dispatchEvent(new CustomEvent("map-search-location", { detail: { lat: hit.lat, lon: hit.lon } }));
    setQuery(hit.title);
    clearResults();
  };

  return (
    <div
      ref={containerRef}
      className="pointer-events-auto absolute left-1/2 top-2 z-30 w-[min(26rem,calc(100vw-9.5rem))] -translate-x-1/2 sm:top-3"
      style={{ opacity: overlayOpacity }}
    >
      <div id="map-compass-slot" className="map-compass-slot pointer-events-auto absolute left-full top-[2px] ml-1.5 sm:ml-2" />
      <form
        className="flex items-center rounded-xl border border-slate-200/80 bg-white/95 p-1 shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95"
        onSubmit={(event) => { event.preventDefault(); void search(); }}
      >
        <Search size={18} className="m-2 shrink-0 text-slate-400 dark:text-zinc-500" />
        <input
          ref={inputRef}
          className="min-w-0 flex-1 bg-transparent px-1 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-zinc-500"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && resultsRef.current) {
              const items = getNavigableItems(resultsRef.current);
              if (items.length > 0) {
                event.preventDefault();
                items[0].focus({ preventScroll: true });
              }
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              if (markerResults.length > 0 || results.length > 0 || error) {
                clearResults();
              } else {
                inputRef.current?.blur();
                focusMapViewport();
              }
            }
          }}
          placeholder="Hae paikkaa, osoitetta tai omaa merkkiä..."
          aria-label="Hae paikkaa"
        />
        {loading && <Loader2 size={15} className="animate-spin text-blue-500 mr-1 shrink-0" />}
        {query && (
          <button
            type="button"
            className="p-1 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            onClick={resetSearch}
            aria-label="Tyhjennä haku"
          >
            <X size={15} />
          </button>
        )}
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50 transition"
          disabled={loading}
        >
          {loading ? "..." : "Hae"}
        </button>
      </form>

      {(markerResults.length > 0 || results.length > 0 || error) && (
        <div
          ref={resultsRef}
          onKeyDown={(event) => {
            if (!resultsRef.current) return;
            const items = getNavigableItems(resultsRef.current);
            const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const idx = active ? items.indexOf(active) : -1;
            if (event.key === "ArrowDown" && items.length > 0) {
              event.preventDefault();
              items[(idx + 1) % items.length].focus({ preventScroll: true });
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              if (idx <= 0) inputRef.current?.focus({ preventScroll: true });
              else items[idx - 1].focus({ preventScroll: true });
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              clearResults();
              inputRef.current?.focus({ preventScroll: true });
            }
          }}
          className="mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white/98 text-xs text-slate-800 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/98 dark:text-zinc-100"
        >
          <div className="max-h-60 overflow-y-auto">
            {markerResults.map((hit) => (
              <button
                key={`marker:${hit.id}`}
                type="button"
                className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2 text-left transition hover:bg-slate-100 last:border-none dark:border-zinc-800/80 dark:hover:bg-zinc-900"
                onClick={() => selectMarker(hit)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin size={14} className="shrink-0" style={{ color: savedMarkerColor }} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{hit.title}</div>
                    {hit.description && (
                      <div className="truncate text-[10px] text-slate-500 dark:text-zinc-400">{hit.description}</div>
                    )}
                  </div>
                </div>
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                  Oma merkki
                </span>
              </button>
            ))}
            {results.map((result) => (
              <button
                key={`${result.lat}:${result.lon}`}
                type="button"
                className="block w-full border-b border-slate-100 px-3.5 py-2.5 text-left transition hover:bg-slate-100 last:border-none dark:border-zinc-800/80 dark:hover:bg-zinc-900"
                onClick={() => select(result)}
              >
                {result.display_name}
              </button>
            ))}
            {error && <div className="px-3.5 py-2.5 text-amber-700 dark:text-amber-400 font-medium">{error}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
