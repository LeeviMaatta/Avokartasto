import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import type OlMap from "ol/Map";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { fromLonLat, toLonLat } from "ol/proj";
import type VectorSource from "ol/source/Vector";
import { useMapStore } from "../../../store/mapStore";
import { setSetting as persistSetting } from "../../../infrastructure/tauri";
import { recordDebugEvent } from "../../debug/services/debugMonitor";
import {
  DEFAULT_ARROW_ZOOM_KEY,
  isTextInputTarget,
  matchesModifierCombo,
  normalizeRotationKeyString,
  parseRotationKey,
} from "../../settings/model/keyboardShortcuts";

interface UseMapNavigationOptions {
  mapRef: RefObject<OlMap | null>;
  elRef: RefObject<HTMLDivElement | null>;
  featSrc: MutableRefObject<VectorSource>;
  viewRestored: MutableRefObject<boolean>;
  heldKeysByCode: MutableRefObject<Map<string, string>>;
  settings: Record<string, string>;
}

export function useMapNavigation({
  mapRef,
  elRef,
  featSrc,
  viewRestored,
  heldKeysByCode,
  settings,
}: UseMapNavigationOptions) {
  const userLocFeatureRef = useRef<Feature | null>(null);
  const [locating, setLocating] = useState(false);
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const handleLocateUser = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Järjestelmä ei tue paikannusta.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lon = pos.coords.longitude;
        const lat = pos.coords.latitude;
        setUserLoc([lon, lat]);
        const map = mapRef.current;
        if (map) {
          map.getView().animate({
            center: fromLonLat([lon, lat]),
            zoom: Math.max(map.getView().getZoom() ?? 10, 15),
            duration: 700,
          });
        }
      },
      (err) => {
        setLocating(false);
        recordDebugEvent("geolocation", err.message || "Geolocation failed", "warning");
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Sijainnin käyttö estetty. Salli sijainti käyttöjärjestelmän asetuksista."
            : "Oman sijainnin haku epäonnistui.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const locateUserRef = useRef(handleLocateUser);
  locateUserRef.current = handleLocateUser;

  useEffect(() => {
    const map = mapRef.current;
    const mapElement = elRef.current;
    if (!map) return;

    const handleSearchLocation = (event: Event) => {
      const detail = (event as CustomEvent<{ lat: number; lon: number; zoom?: number }>).detail;
      if (!detail || !Number.isFinite(detail.lat) || !Number.isFinite(detail.lon)) return;
      const targetZoom = typeof detail.zoom === "number" && Number.isFinite(detail.zoom)
        ? detail.zoom
        : Math.max(map.getView().getZoom() ?? 10, 14);
      map.getView().animate({ center: fromLonLat([detail.lon, detail.lat]), zoom: targetZoom, duration: 500 });
    };

    const onMapArrowZoomKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (isTextInputTarget(event.target)) return;
      const currentSettings = useMapStore.getState().settings;
      const normalizedKey =
        normalizeRotationKeyString(currentSettings.arrowZoomKey || DEFAULT_ARROW_ZOOM_KEY) || DEFAULT_ARROW_ZOOM_KEY;
      const parsed = parseRotationKey(normalizedKey, DEFAULT_ARROW_ZOOM_KEY);
      if (!matchesModifierCombo(event, parsed, heldKeysByCode.current)) return;
      event.preventDefault();
      event.stopPropagation();
      const view = map.getView();
      const z = view.getZoom();
      if (z === undefined) return;
      const nextZoom = event.key === "ArrowUp" ? Math.min(21, z + 1) : Math.max(0, z - 1);
      view.animate({ zoom: nextZoom, duration: 150 });
    };

    mapElement?.addEventListener("keydown", onMapArrowZoomKeyDown, { capture: true });
    window.addEventListener("map-search-location", handleSearchLocation);
    window.addEventListener("map-focus", handleSearchLocation);
    return () => {
      mapElement?.removeEventListener("keydown", onMapArrowZoomKeyDown, { capture: true });
      window.removeEventListener("map-search-location", handleSearchLocation);
      window.removeEventListener("map-focus", handleSearchLocation);
    };
  }, [mapRef, elRef, heldKeysByCode]);

  useEffect(() => {
    if (userLocFeatureRef.current) {
      featSrc.current.removeFeature(userLocFeatureRef.current);
      userLocFeatureRef.current = null;
    }
    if (!userLoc) return;
    const feat = new Feature({
      geometry: new Point(fromLonLat(userLoc)),
      color: "#2563eb",
      isUserLoc: true,
    });
    featSrc.current.addFeature(feat);
    userLocFeatureRef.current = feat;
  }, [featSrc, userLoc]);

  useEffect(() => {
    const onMapAction = (event: Event) => {
      const action = (event as CustomEvent<string>).detail;
      const map = mapRef.current;
      if (!map) return;
      const view = map.getView();
      switch (action) {
        case "zoomIn": {
          const z = view.getZoom();
          if (z !== undefined) view.animate({ zoom: Math.min(21, z + 1), duration: 150 });
          break;
        }
        case "zoomOut": {
          const z = view.getZoom();
          if (z !== undefined) view.animate({ zoom: Math.max(0, z - 1), duration: 150 });
          break;
        }
        case "locateUser":
          locateUserRef.current();
          break;
        case "resetRotation":
          view.animate({ rotation: 0, duration: 200 });
          break;
        case "toggleFullscreen":
          if (document.fullscreenElement) {
            void document.exitFullscreen().catch(() => {});
          } else {
            void document.documentElement.requestFullscreen?.().catch(() => {});
          }
          break;
      }
    };
    window.addEventListener("kb-map-action", onMapAction);
    return () => window.removeEventListener("kb-map-action", onMapAction);
  }, [mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || viewRestored.current || Object.keys(settings).length === 0) return;
    const center = (() => {
      try {
        const initialVal = settings.initialMapCenter ? JSON.parse(settings.initialMapCenter) : null;
        if (Array.isArray(initialVal) && initialVal.length === 2 && initialVal.every((item) => typeof item === "number" && Number.isFinite(item))) {
          return fromLonLat(initialVal as [number, number]);
        }
        const value = JSON.parse(settings.lastMapCenter ?? "");
        return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number" && Number.isFinite(item))
          ? fromLonLat(value as [number, number])
          : null;
      } catch {
        return null;
      }
    })();
    const initialZoom = Number(settings.initialMapZoom);
    const zoom = Number.isFinite(initialZoom) ? initialZoom : Number(settings.lastMapZoom);
    if (center) map.getView().setCenter(center);
    if (Number.isFinite(zoom)) map.getView().setZoom(Math.max(0, Math.min(21, zoom)));
    viewRestored.current = true;
    const currentCenter = map.getView().getCenter();
    if (currentCenter) {
      const [lon, lat] = toLonLat(currentCenter);
      useMapStore.setState({ centerCoord: [lon, lat] });
    }
    return () => {
      if (viewRestored.current) {
        const c = map.getView().getCenter();
        const z = map.getView().getZoom();
        if (c && z !== undefined) {
          void persistSetting("lastMapCenter", JSON.stringify(toLonLat(c)));
          void persistSetting("lastMapZoom", String(z));
        }
      }
    };
  }, [mapRef, viewRestored, settings]);

  return { locating, geoError, setGeoError, handleLocateUser };
}
