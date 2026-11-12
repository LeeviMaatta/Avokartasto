import { useEffect, useRef, useState } from "react";
import {
  ArrowUpDown,
  Bike,
  Car,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Download,
  Footprints,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  Route as RouteIcon,
  Trash2,
  X,
} from "lucide-react";
import { useMapStore } from "../../store/mapStore";
import { usePersistedBool } from "../settings/model/persistedUiState";
import {
  calculateRoute,
  formatRouteDistance,
  formatRouteDuration,
  type RouteMode,
  type RoutePoint,
} from "./routeService";
import { searchNominatim, type NominatimSearchHit } from "../map/sources/nominatimService";
import { exportGeoJsonFile } from "../../shared/exportFile";
import { searchSavedMarkers, type MarkerSearchHit } from "../markers/domain/markerSearch";

type SearchHit = NominatimSearchHit;

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

  const [inputs, setInputs] = useState<string[]>([]);
  const [activeSearchIdx, setActiveSearchIdx] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [markerHits, setMarkerHits] = useState<MarkerSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [stepsOpen, toggleStepsOpen] = usePersistedBool("routeStepsOpen", true);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const searchAbortRef = useRef<AbortController | null>(null);

  // Synkronoidaan tekstikentät storen pisteiden kanssa
  useEffect(() => {
    setInputs(routePoints.map((p) => p?.label ?? ""));
  }, [routePoints]);

  // Lasketaan reitti automaattisesti, kun kaikki pisteet on asetettu
  useEffect(() => {
    if (tool !== "route") return;
    const validPoints = routePoints.filter((p): p is RoutePoint => p !== null);
    if (validPoints.length < 2 || validPoints.length !== routePoints.length) {
      useMapStore.setState({ routeResult: null });
      setRouteError(null);
      return;
    }

    const ac = new AbortController();
    setLoadingRoute(true);
    setRouteError(null);
    setExportMsg(null);

    calculateRoute(validPoints, routeMode, ac.signal)
      .then((res) => {
        if (!ac.signal.aborted) {
          useMapStore.setState({ routeResult: res });
        }
      })
      .catch((err) => {
        if (!ac.signal.aborted) {
          useMapStore.setState({ routeResult: null });
          setRouteError(err instanceof Error ? err.message : "Reitin laskenta epäonnistui.");
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingRoute(false);
      });

    return () => ac.abort();
  }, [tool, routePoints, routeMode]);

  if (tool !== "route") return null;

  const searchMarkersLive = (idx: number, text: string) => {
    const q = text.trim();
    if (!q) {
      setMarkerHits([]);
      if (activeSearchIdx === idx) setSearchResults([]);
      return;
    }
    setActiveSearchIdx(idx);
    void searchSavedMarkers(q)
      .then((hits) => setMarkerHits(hits))
      .catch(() => setMarkerHits([]));
  };

  const runSearch = async (idx: number, text: string) => {
    const q = text.trim();
    if (!q) {
      setSearchResults([]);
      setMarkerHits([]);
      return;
    }
    setActiveSearchIdx(idx);
    try {
      const mHits = await searchSavedMarkers(q);
      setMarkerHits(mHits);
    } catch {
      setMarkerHits([]);
    }
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    searchAbortRef.current?.abort();
    const ac = new AbortController();
    searchAbortRef.current = ac;
    setSearching(true);
    try {
      const data = await searchNominatim(q, {
        limit: 5,
        signal: ac.signal,
        label: "route-geocode",
      });
      if (!ac.signal.aborted) {
        setSearchResults(data);
      }
    } catch {
      // Ignoroidaan keskeytetyt haut
    } finally {
      if (!ac.signal.aborted) setSearching(false);
    }
  };

  const selectSearchHit = (idx: number, hit: SearchHit) => {
    const lon = Number(hit.lon);
    const lat = Number(hit.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const shortLabel = hit.display_name.split(",").slice(0, 2).join(", ");
    setRoutePoint(idx, { coord: [lon, lat], label: shortLabel });
    setSearchResults([]);
    setMarkerHits([]);
    setActiveSearchIdx(null);
    window.dispatchEvent(new CustomEvent("map-focus", { detail: { lon, lat, zoom: 13 } }));
  };

  const selectMarkerHit = (idx: number, hit: MarkerSearchHit) => {
    setRoutePoint(idx, { coord: [hit.lon, hit.lat], label: hit.title });
    setSearchResults([]);
    setMarkerHits([]);
    setActiveSearchIdx(null);
    window.dispatchEvent(new CustomEvent("map-focus", { detail: { lon: hit.lon, lat: hit.lat, zoom: 13 } }));
  };

  const pointBadge = (idx: number) => {
    if (idx === 0) return { text: "A", cls: "bg-emerald-600 text-white" };
    if (idx === routePoints.length - 1) return { text: "B", cls: "bg-red-600 text-white" };
    return { text: String(idx), cls: "bg-blue-600 text-white" };
  };

  const exportRouteGeoJson = async () => {
    if (!routeResult) return;
    const content = JSON.stringify(
      {
        type: "Feature",
        properties: {
          provider: routeResult.provider,
          mode: routeResult.mode,
          distance_m: Math.round(routeResult.distance),
          duration_s: Math.round(routeResult.duration),
        },
        geometry: {
          type: "LineString",
          coordinates: routeResult.coordinates,
        },
      },
      null,
      2,
    );
    const filename = `reitti-${new Date().toISOString().slice(0, 10)}.geojson`;

    try {
      const result = await exportGeoJsonFile(filename, content);
      if (result.status === "saved") {
        setExportMsg(`Viety: ${result.path}`);
      }
    } catch (err) {
      setExportMsg(`Vienti epäonnistui: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div
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
        {routePoints.map((pt, idx) => {
          const badge = pointBadge(idx);
          const isPicking = routePickTarget === idx;
          return (
            <div key={idx} className="relative">
              <div className="flex items-center gap-1.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${badge.cls}`}
                >
                  {badge.text}
                </span>
                <input
                  type="text"
                  value={inputs[idx] ?? ""}
                  placeholder={
                    idx === 0
                      ? "Lähtöpiste (hae tai klikkaa karttaa)"
                      : idx === routePoints.length - 1
                      ? "Määränpää (hae tai klikkaa karttaa)"
                      : "Välietappi"
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    setInputs((prev) => {
                      const next = [...prev];
                      next[idx] = val;
                      return next;
                    });
                    searchMarkersLive(idx, val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void runSearch(idx, inputs[idx] ?? "");
                    if (e.key === "Escape") {
                      setActiveSearchIdx(null);
                      setMarkerHits([]);
                      setSearchResults([]);
                    }
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <button
                  type="button"
                  onClick={() => useMapStore.setState({ routePickTarget: isPicking ? null : idx })}
                  className={`rounded-lg border p-1.5 transition shrink-0 ${
                    isPicking
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                  title="Valitse piste klikkaamalla karttaa"
                >
                  <Crosshair size={13} />
                </button>
                {(pt !== null || routePoints.length > 2) && (
                  <button
                    type="button"
                    onClick={() => removeRoutePoint(idx)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500 dark:hover:bg-zinc-800 transition shrink-0"
                    title={routePoints.length > 2 ? "Poista piste" : "Tyhjennä piste"}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {activeSearchIdx === idx && (markerHits.length > 0 || searchResults.length > 0 || searching) && (
                <div className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
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
                      onClick={() => selectMarkerHit(idx, hit)}
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
                      onClick={() => selectSearchHit(idx, hit)}
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
        })}

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
        <div className="flex min-h-0 flex-1 flex-col border-t border-slate-100 dark:border-zinc-800">
          <div className="flex items-center justify-between bg-slate-50/70 px-3 py-2 dark:bg-zinc-900/50">
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {formatRouteDuration(routeResult.duration)} · {formatRouteDistance(routeResult.distance)}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-500">
                Moottori: {routeResult.provider}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void exportRouteGeoJson()}
                className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-medium hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800 transition"
                title="Vie reitti GeoJSON-tiedostona"
              >
                <Download size={12} /> Vie
              </button>
              <button
                type="button"
                onClick={toggleStepsOpen}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800 transition"
                title={stepsOpen ? "Piilota ohjeet" : "Näytä ohjeet"}
              >
                {stepsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>
          </div>

          {exportMsg && (
            <div className={`px-3 py-1 text-[11px] ${exportMsg.startsWith("Vienti epäonnistui") ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {exportMsg}
            </div>
          )}

          {stepsOpen && routeResult.steps.length > 0 && (
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/80">
              {routeResult.steps.map((step, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("map-focus", {
                        detail: { lon: step.coord[0], lat: step.coord[1], zoom: 16 },
                      }),
                    )
                  }
                  className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-zinc-900/60 transition"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <Navigation size={12} className="mt-0.5 shrink-0 text-blue-500" />
                    <span className="text-[11px] leading-snug text-slate-700 dark:text-zinc-200">
                      {step.instruction}
                    </span>
                  </div>
                  {step.distance > 0 && (
                    <span className="shrink-0 text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                      {formatRouteDistance(step.distance)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
