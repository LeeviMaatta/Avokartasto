import { useCallback, useEffect, useRef, useState } from "react";
import { useMapStore } from "../../../store/mapStore";
import { focusMapViewport } from "../../../shared/keyboardNavigation";
import { calculateRoute, type RouteMode, type RoutePoint } from "../services/routeService";
import { searchNominatim, type NominatimSearchHit } from "../../search/services/nominatimService";
import { searchSavedMarkers, type MarkerSearchHit } from "../../markers/domain/markerSearch";

export function useRoutePlanner(
  tool: string,
  routePoints: (RoutePoint | null)[],
  routeMode: RouteMode,
  setRoutePoint: (index: number, point: RoutePoint | null) => void,
) {
  const [inputs, setInputs] = useState<string[]>([]);
  const [activeSearchIdx, setActiveSearchIdx] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<NominatimSearchHit[]>([]);
  const [markerHits, setMarkerHits] = useState<MarkerSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const clearSearchDropdown = useCallback(() => {
    setActiveSearchIdx(null);
    setMarkerHits([]);
    setSearchResults([]);
  }, []);

  useEffect(() => {
    setInputs(routePoints.map((p) => p?.label ?? ""));
  }, [routePoints]);

  useEffect(() => {
    if (tool !== "route") return;
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"], [data-shortcut-capturing="true"]')) return;
      if (activeSearchIdx !== null) {
        event.preventDefault();
        clearSearchDropdown();
        return;
      }
      event.preventDefault();
      useMapStore.setState({ tool: "none", routePickTarget: null });
      focusMapViewport();
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [tool, activeSearchIdx, clearSearchDropdown]);

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

  useEffect(() => () => {
    searchAbortRef.current?.abort();
  }, []);

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

  const selectSearchHit = (idx: number, hit: NominatimSearchHit) => {
    const lon = Number(hit.lon);
    const lat = Number(hit.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const shortLabel = hit.display_name.split(",").slice(0, 2).join(", ");
    setRoutePoint(idx, { coord: [lon, lat], label: shortLabel });
    clearSearchDropdown();
    window.dispatchEvent(new CustomEvent("map-focus", { detail: { lon, lat, zoom: 13 } }));
  };

  const selectMarkerHit = (idx: number, hit: MarkerSearchHit) => {
    setRoutePoint(idx, { coord: [hit.lon, hit.lat], label: hit.title });
    clearSearchDropdown();
    window.dispatchEvent(new CustomEvent("map-focus", { detail: { lon: hit.lon, lat: hit.lat, zoom: 13 } }));
  };

  const updateInput = (idx: number, val: string) => {
    setInputs((prev) => {
      const next = [...prev];
      next[idx] = val;
      return next;
    });
    searchMarkersLive(idx, val);
  };

  return {
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
  };
}
