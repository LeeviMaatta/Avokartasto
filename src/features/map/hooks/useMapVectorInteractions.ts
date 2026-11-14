import { useEffect, type MutableRefObject, type RefObject } from "react";
import type OlMap from "ol/Map";
import type MapBrowserEvent from "ol/MapBrowserEvent";
import type Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import { toLonLat } from "ol/proj";
import { getArea, getLength } from "ol/sphere";
import type VectorSource from "ol/source/Vector";
import { useMapStore } from "../../../store/mapStore";
import {
  clearSavedEditFeatures,
  ensureUnsavedMeasurementId,
} from "../../measurements/domain/measurementSource";
import type { RoutePoint, RouteResult } from "../../routing/services/routeService";
import {
  fetchLineElevationProfile,
  useMapMeasurementSync,
} from "./useMapMeasurementSync";

export interface ContextMenuTarget {
  feature: Feature;
  x: number;
  y: number;
  savedId?: number;
}

interface UseMapVectorInteractionsOptions {
  mapRef: RefObject<OlMap | null>;
  elRef: RefObject<HTMLDivElement | null>;
  measureSrc: MutableRefObject<VectorSource>;
  featSrc: MutableRefObject<VectorSource>;
  routeSrc: MutableRefObject<VectorSource>;
  pendingMarkerFeature: MutableRefObject<Feature | null>;
  profileRequest: MutableRefObject<number>;
  setContextMenu: (val: ContextMenuTarget | null) => void;
  tool: string;
  routePoints: (RoutePoint | null)[];
  routeResult: RouteResult | null;
  routePickTarget: number | null;
  pendingMarker: [number, number] | null;
  hiddenFeaturesSetting?: string;
  markerFoldersSetting?: string;
}

export function useMapVectorInteractions({
  mapRef,
  elRef,
  measureSrc,
  featSrc,
  routeSrc,
  pendingMarkerFeature,
  profileRequest,
  setContextMenu,
  tool,
  routePoints,
  routeResult,
  routePickTarget,
  pendingMarker,
  hiddenFeaturesSetting,
  markerFoldersSetting,
}: UseMapVectorInteractionsOptions) {
  useMapMeasurementSync({
    mapRef,
    measureSrc,
    featSrc,
    routeSrc,
    pendingMarkerFeature,
    profileRequest,
    pendingMarker,
    routePoints,
    routeResult,
    hiddenFeaturesSetting,
    markerFoldersSetting,
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleSingleClick = async (e: MapBrowserEvent<UIEvent>) => {
      const state = useMapStore.getState();
      if (state.tool === "route" && state.routePickTarget !== null) {
        const [lon, lat] = toLonLat(e.coordinate);
        state.setRoutePoint(state.routePickTarget, {
          coord: [lon, lat],
          label: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
        });
        return;
      }
      const clickedFeature = map.forEachFeatureAtPixel(
        e.pixel,
        (feat) => {
          if (measureSrc.current.hasFeature(feat as Feature) || featSrc.current.hasFeature(feat as Feature)) {
            return feat;
          }
          return undefined;
        },
        { hitTolerance: 12 },
      ) as Feature | undefined;
      if (!clickedFeature) return;
      const geom = clickedFeature.getGeometry();
      const rawId = clickedFeature.get("id");
      const savedId =
        clickedFeature !== pendingMarkerFeature.current && rawId !== undefined && rawId !== null
          ? Number(rawId)
          : null;
      const saved = savedId !== null && Number.isFinite(savedId);
      if (saved && geom instanceof Point) {
        clearSavedEditFeatures(measureSrc.current);
        useMapStore.setState({
          selectedFeature: {
            id: savedId,
            kind: "marker",
            title: String(clickedFeature.get("title") || "Merkki"),
            description: clickedFeature.get("description") ?? null,
            color: clickedFeature.get("color") || "#dc2626",
            folder_id: clickedFeature.get("folder_id") ?? null,
            geojson: new GeoJSON().writeGeometry(geom, {
              dataProjection: "EPSG:4326",
              featureProjection: "EPSG:3857",
            }),
          },
          editingFeatureId: null,
          activeUnsavedMeasurementId: null,
          measure: null,
          profile: null,
          profileVisible: false,
          profileError: null,
          tool: "none",
        });
        return;
      }
      if (!(geom instanceof LineString) && !(geom instanceof Polygon)) return;
      const kind = geom instanceof Polygon ? "area" : "distance";
      const length =
        kind === "area"
          ? getArea(geom, { projection: "EPSG:3857" })
          : getLength(geom, { projection: "EPSG:3857" });
      const geojson = new GeoJSON().writeGeometry(geom, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      });
      let nextUnsavedId: string | null = null;
      if (saved) {
        clearSavedEditFeatures(measureSrc.current);
        const editable = clickedFeature.clone();
        editable.set("id", savedId);
        measureSrc.current.addFeature(editable);
      } else {
        clearSavedEditFeatures(measureSrc.current);
        nextUnsavedId = ensureUnsavedMeasurementId(clickedFeature);
      }
      useMapStore.setState({
        pendingMarker: null,
        markerEditorOpen: false,
        measure: { length, geojson, kind },
        profile: null,
        profileVisible: false,
        profileError: null,
        editingFeatureId: saved ? savedId : null,
        activeUnsavedMeasurementId: saved ? null : nextUnsavedId,
        selectedFeature: saved
          ? {
              id: savedId,
              kind: "measurement",
              title: String(clickedFeature.get("title") || "Mittaus"),
              description: clickedFeature.get("description") ?? null,
              color: clickedFeature.get("color") || "#dc2626",
              folder_id: clickedFeature.get("folder_id") ?? null,
              geojson,
            }
          : null,
      });
      if (geom instanceof LineString) await fetchLineElevationProfile(geom, profileRequest);
    };

    const handleDblClickReset = () => {
      const state = useMapStore.getState();
      if (state.settings.removePendingMarkerOnDblClick === "0") return false;
      if (
        state.editingFeatureId !== null ||
        (state.activeUnsavedMeasurementId !== null && state.tool !== "measure")
      ) {
        if (state.editingFeatureId !== null) clearSavedEditFeatures(measureSrc.current);
        profileRequest.current += 1;
        useMapStore.setState({
          editingFeatureId: null,
          activeUnsavedMeasurementId: null,
          measure: null,
          selectedFeature: null,
          profile: null,
          profileVisible: false,
          profileError: null,
        });
        return true;
      }
      if (state.tool === "measure") return false;
      if (!state.pendingMarker && !pendingMarkerFeature.current) return false;
      if (pendingMarkerFeature.current) {
        featSrc.current.removeFeature(pendingMarkerFeature.current);
        pendingMarkerFeature.current = null;
      }
      useMapStore.setState({ pendingMarker: null, markerEditorOpen: false });
      return true;
    };

    const viewport = map.getViewport();
    const handleMapDblClick = (e: MapBrowserEvent<UIEvent>) => {
      if (e.originalEvent instanceof MouseEvent && e.originalEvent.button !== 0) return;
      if (handleDblClickReset()) {
        e.preventDefault();
        return false;
      }
    };
    const handleViewportDblClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (handleDblClickReset()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const pixel = map.getEventPixel(e);
      let clickedFeature: Feature | null = null;
      let savedId: number | undefined;
      map.forEachFeatureAtPixel(
        pixel,
        (feat) => {
          const feature = feat as Feature;
          if (measureSrc.current.hasFeature(feature) || featSrc.current.hasFeature(feature)) {
            clickedFeature = feature;
            if (feature !== pendingMarkerFeature.current && feature.get("id") != null) {
              savedId = Number(feature.get("id"));
            }
            return true;
          }
        },
        { hitTolerance: 12 },
      );
      const selectedFeature = clickedFeature as Feature | null;
      if (selectedFeature) {
        if (savedId !== undefined) {
          useMapStore.setState({
            selectedFeature: {
              id: savedId,
              kind: selectedFeature.getGeometry() instanceof Point ? "marker" : "measurement",
              title: String(selectedFeature.get("title") || "Mittaus"),
              description: selectedFeature.get("description") ?? null,
              color: selectedFeature.get("color") || "#dc2626",
              folder_id: selectedFeature.get("folder_id") ?? null,
              geojson: selectedFeature.getGeometry()
                ? new GeoJSON().writeGeometry(selectedFeature.getGeometry()!, {
                    dataProjection: "EPSG:4326",
                    featureProjection: "EPSG:3857",
                  })
                : undefined,
            },
          });
        }
        setContextMenu({ feature: selectedFeature, x: pixel[0], y: pixel[1], savedId });
      } else {
        setContextMenu(null);
        const [lon, lat] = toLonLat(map.getEventCoordinate(e));
        useMapStore.setState({ pendingMarker: [lon, lat], tool: "none", markerEditorOpen: false });
      }
    };
    const closeContextMenuOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-feature-context-menu]")) setContextMenu(null);
    };

    const singleClickKey = map.on("singleclick", (e) => {
      void handleSingleClick(e);
    });
    const dblClickKey = map.on("dblclick", handleMapDblClick);
    viewport.addEventListener("dblclick", handleViewportDblClick);
    viewport.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("pointerdown", closeContextMenuOutside);
    return () => {
      map.un("singleclick", singleClickKey.listener);
      map.un("dblclick", dblClickKey.listener);
      viewport.removeEventListener("dblclick", handleViewportDblClick);
      viewport.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("pointerdown", closeContextMenuOutside);
    };
  }, [mapRef, measureSrc, featSrc, pendingMarkerFeature, profileRequest, setContextMenu]);

  useEffect(() => {
    const mapElement = elRef.current;
    if (!mapElement) return;
    mapElement.style.cursor = tool === "route" && routePickTarget !== null ? "crosshair" : "";
  }, [elRef, tool, routePickTarget]);
}
