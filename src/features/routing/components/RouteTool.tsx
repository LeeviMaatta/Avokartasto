import { ArrowUpDown, Bike, Car, Footprints, Loader2, Plus, Route as RouteIcon, Trash2, X } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { usePersistedBool } from "../../settings/hooks/persistedUiState";
import { focusMapViewport, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import type { RouteMode } from "../services/routeService";
import { exportRouteAsGeoJson } from "../domain/routeExport";
import { useRoutePlanner } from "../hooks/useRoutePlanner";
import { WaypointSearchInput } from "./WaypointSearchInput";
import { RouteStepsList } from "./RouteStepsList";

const MODES: { id: RouteMode; label: string; icon: typeof Car }[] = [
  { id: "auto", label: "Auto", icon: Car },
  { id: "bicycle", label: "Pyörä", icon: Bike },
  { id: "pedestrian", label: "Kävely", icon: Footprints },
];

export default function RouteTool() {
  const tool = useMapStore((s) => s.tool);
  const routePoints = useMapStore((s) => s.routePoints);
  const routeMode = useMapStore((s) => s.routeMode);
  const routeResult = useMapStore((s) => s.routeResult);
  const routePickTarget = useMapStore((s) => s.routePickTarget);
  const setRoutePoint = useMapStore((s) => s.setRoutePoint);
  const addRouteWaypoint = useMapStore((s) => s.addRouteWaypoint);
  const removeRoutePoint = useMapStore((s) => s.removeRoutePoint);
  const swapRoutePoints = useMapStore((s) => s.swapRoutePoints);
  const clearRoute = useMapStore((s) => s.clearRoute);
  const rawOverlayOpacity = Number(useMapStore((s) => s.settings.uiOverlayOpacity ?? "1"));
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;
  const savedMarkerColor = useMapStore((s) => s.settings.savedMarkerColor ?? "#dc2626");

  const [stepsOpen, toggleStepsOpen] = usePersistedBool("routeStepsOpen", true);
  const {
    inputs,
    activeSearchIdx,
    searchResults,
    markerHits,
    searching,
    loadingRoute,
    routeError,
    setRouteError,
    exportMsg,
    setExportMsg,
    clearSearchDropdown,
    updateInput,
    runSearch,
    selectSearchHit,
    selectMarkerHit,
  } = useRoutePlanner(tool, routePoints, routeMode, setRoutePoint);

  if (tool !== "route") return null;

  const handleExportRoute = async () => {
    if (!routeResult) return;
    try {
      const savedPath = await exportRouteAsGeoJson(routeResult);
      if (savedPath) setExportMsg(`Viety: ${savedPath}`);
    } catch (err) {
      setExportMsg(`Vienti epäonnistui: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div
      onKeyDown={(e) =>
        handleContainerArrowKeyDown(e, {
          orientation: "both",
          onEscape: () => {
            useMapStore.setState({ tool: "none", routePickTarget: null });
            focusMapViewport();
          },
        })
      }
      className="absolute right-2 top-14 z-30 flex max-h-[calc(100vh-5rem)] w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 text-xs text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 sm:right-3"
      style={{ opacity: overlayOpacity }}
    >
      {/* Otsikko */}
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-zinc-800">
        <div className="flex items-center gap-1.5 font-semibold text-sm">
          <RouteIcon size={16} className="text-blue-600 dark:text-blue-400" />
          <span>Reitinhaku</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              clearRoute();
              setRouteError(null);
              setExportMsg(null);
            }}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-zinc-800 dark:hover:text-red-400 transition"
            title="Tyhjennä reitti"
          >
            <Trash2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => useMapStore.setState({ tool: "none", routePickTarget: null })}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"
            title="Sulje reitinhaku"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Kulkumuoto */}
      <div className="grid grid-cols-3 gap-1 border-b border-slate-100 p-2 dark:border-zinc-800">
        {MODES.map(({ id, label, icon: Icon }) => {
          const active = routeMode === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => useMapStore.setState({ routeMode: id })}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 font-medium transition ${
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              <Icon size={14} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Reittipisteet */}
      <div className="space-y-1.5 p-2.5">
        {routePoints.map((pt, idx) => (
          <WaypointSearchInput
            key={idx}
            idx={idx}
            totalPoints={routePoints.length}
            hasPoint={pt !== null}
            value={inputs[idx] ?? ""}
            isPicking={routePickTarget === idx}
            isActiveSearch={activeSearchIdx === idx}
            searching={searching}
            markerHits={markerHits}
            searchResults={searchResults}
            savedMarkerColor={savedMarkerColor}
            onInputChange={updateInput}
            onRunSearch={(i, text) => void runSearch(i, text)}
            onTogglePick={(i) => useMapStore.setState({ routePickTarget: routePickTarget === i ? null : i })}
            onRemovePoint={removeRoutePoint}
            onClearSearchDropdown={clearSearchDropdown}
            onSelectMarkerHit={selectMarkerHit}
            onSelectSearchHit={selectSearchHit}
          />
        ))}

        <div className="flex items-center justify-between pt-0.5">
          <button
            type="button"
            onClick={addRouteWaypoint}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 transition"
          >
            <Plus size={12} /> Lisää välietappi
          </button>
          <button
            type="button"
            onClick={swapRoutePoints}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
            title="Vaihda suunta"
          >
            <ArrowUpDown size={12} /> Käännä
          </button>
        </div>

        {routePickTarget !== null && (
          <div className="rounded-lg bg-blue-50 px-2.5 py-1.5 text-[11px] text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            Klikkaa kartalta: <b>{routePickTarget === 0 ? "Lähtöpiste (A)" : routePickTarget === routePoints.length - 1 ? "Määränpää (B)" : `Välietappi ${routePickTarget}`}</b>
          </div>
        )}
      </div>

      {/* Lataus / Virhe */}
      {loadingRoute && (
        <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-slate-600 dark:border-zinc-800 dark:text-zinc-300">
          <Loader2 size={14} className="animate-spin text-blue-600" />
          <span>Lasketaan reittiä...</span>
        </div>
      )}

      {routeError && (
        <div className="border-t border-slate-100 px-3 py-2 text-red-600 dark:border-zinc-800 dark:text-red-400">
          {routeError}
        </div>
      )}

      {/* Reittitulos & ohjeet */}
      {routeResult && !loadingRoute && (
        <RouteStepsList
          routeResult={routeResult}
          stepsOpen={stepsOpen}
          exportMsg={exportMsg}
          onToggleSteps={toggleStepsOpen}
          onExport={() => void handleExportRoute()}
        />
      )}
    </div>
  );
}
