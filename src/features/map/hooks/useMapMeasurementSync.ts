import { useEffect, type MutableRefObject, type RefObject } from "react";
import type OlMap from "ol/Map";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import { fromLonLat } from "ol/proj";
import { getLength } from "ol/sphere";
import type VectorSource from "ol/source/Vector";
import { useMapStore } from "../../../store/mapStore";
import {
  focusNextUnsavedMeasurement,
  focusSingleMeasurementItem,
  selectLinkedMeasurements,
} from "../../measurements/domain/measurementClickSelect";
import { fetchLineElevationProfile } from "../../measurements/domain/measurementProfile";
import {
  getLinkedMeasurementGroup,
  toMeasurementLinkKey,
  updateMeasurementItemInSelection,
  type SelectedMeasurementItem,
} from "../../measurements/domain/measurementSelection";
import {
  clearSavedEditFeatures,
  findTargetMeasurementFeature,
  getUnsavedMeasurementFeatures,
  removeAllUnsavedMeasurements,
  removeUnsavedMeasurementByGeojson,
  removeUnsavedMeasurementById,
} from "../../measurements/domain/measurementSource";
import type { RoutePoint, RouteResult } from "../../routing/services/routeService";
import {
  isFeatureHiddenBySettings,
  syncHiddenEditedMeasurements,
  syncRouteFeaturesToSource,
} from "./mapLayerSyncHelpers";

export { fetchLineElevationProfile };

interface UseMapMeasurementSyncOptions {
  mapRef: RefObject<OlMap | null>;
  measureSrc: MutableRefObject<VectorSource>;
  featSrc: MutableRefObject<VectorSource>;
  routeSrc: MutableRefObject<VectorSource>;
  pendingMarkerFeature: MutableRefObject<Feature | null>;
  profileRequest: MutableRefObject<number>;
  tool: string;
  pendingMarker: [number, number] | null;
  routePoints: (RoutePoint | null)[];
  routeResult: RouteResult | null;
  hiddenFeaturesSetting?: string;
  markerFoldersSetting?: string;
}

/** Synchronizes measurement custom events, pending markers, routes, and hidden-feature state onto vector sources. */
export function useMapMeasurementSync({
  mapRef,
  measureSrc,
  featSrc,
  routeSrc,
  pendingMarkerFeature,
  profileRequest,
  tool,
  pendingMarker,
  routePoints,
  routeResult,
  hiddenFeaturesSetting,
  markerFoldersSetting,
}: UseMapMeasurementSyncOptions) {
  useEffect(() => {
    let lastRemovedUnsavedIndex: number | undefined;
    const removeMeasurementFeature = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          savedId?: number | null;
          unsavedId?: string | null;
          geojson?: string;
        }>
      ).detail;
      if (detail?.savedId !== undefined && detail?.savedId !== null) {
        clearSavedEditFeatures(measureSrc.current, detail.savedId);
      } else {
        if (detail?.unsavedId) {
          const idx = getUnsavedMeasurementFeatures(measureSrc.current).findIndex(
            (f) => f.get("unsavedId") === detail.unsavedId,
          );
          if (idx >= 0) lastRemovedUnsavedIndex = idx;
          removeUnsavedMeasurementById(measureSrc.current, detail.unsavedId);
          useMapStore.getState().unlinkMeasurement(detail.unsavedId);
        }
        if (detail?.geojson) removeUnsavedMeasurementByGeojson(measureSrc.current, detail.geojson);
      }
      profileRequest.current += 1;
    };

    const handleFocusNextUnsaved = (event: Event) => {
      const detail = (event as CustomEvent<{ preferredIndex?: number } | undefined>).detail;
      const preferredIndex = detail?.preferredIndex ?? lastRemovedUnsavedIndex;
      lastRemovedUnsavedIndex = undefined;
      const line = focusNextUnsavedMeasurement(measureSrc.current, preferredIndex);
      if (line) void fetchLineElevationProfile(line, profileRequest);
    };

    const handleSelectLinked = (event: Event) => {
      const detail = (
        event as CustomEvent<{ linkKey?: string | null; savedId?: number | null; unsavedId?: string | null }>
      ).detail;
      const state = useMapStore.getState();
      const targetKey =
        detail?.linkKey ??
        toMeasurementLinkKey({
          savedId: detail?.savedId ?? state.editingFeatureId,
          unsavedId: detail?.unsavedId ?? state.activeUnsavedMeasurementId,
        });
      if (!targetKey) return;
      const groupKeys = getLinkedMeasurementGroup(state.measurementLinks, targetKey);
      selectLinkedMeasurements(measureSrc.current, featSrc.current, groupKeys, targetKey);
    };

    const handleFocusSingle = (event: Event) => {
      const detail = (event as CustomEvent<{ item?: SelectedMeasurementItem }>).detail;
      if (!detail?.item) return;
      const line = focusSingleMeasurementItem(measureSrc.current, detail.item);
      if (line) void fetchLineElevationProfile(line, profileRequest);
    };

    const handleOpenMeasurementEditor = (event: Event) => {
      const detail = (
        event as CustomEvent<{ id: number; geojson: string; folder_id?: string | null }>
      ).detail;
      if (!detail?.geojson) return;
      try {
        const geometry = new GeoJSON().readGeometry(JSON.parse(detail.geojson), {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });
        clearSavedEditFeatures(measureSrc.current);
        if (
          !isFeatureHiddenBySettings(detail.id, detail.folder_id, useMapStore.getState().settings)
        ) {
          const editable = new Feature({ geometry });
          editable.set("id", detail.id);
          measureSrc.current.addFeature(editable);
        }
        if (geometry instanceof LineString) {
          void fetchLineElevationProfile(geometry, profileRequest);
        }
      } catch (error) {
        console.error("Muokattavan mittauksen geometriaa ei voitu ladata kartalle", error);
      }
    };

    const replaceMeasurementGeometry = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          savedId?: number | null;
          unsavedId?: string | null;
          geojson?: string;
          profile?: Array<{ dist: number; elev: number | null }> | null;
        }>
      ).detail;
      if (!detail?.geojson) return;
      try {
        const geometry = new GeoJSON().readGeometry(JSON.parse(detail.geojson), {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });
        if (!(geometry instanceof LineString)) return;
        const targetFeature =
          findTargetMeasurementFeature(
            measureSrc.current,
            detail.savedId ?? null,
            detail.unsavedId ?? null,
          ) ??
          measureSrc.current.getFeatures().find((f) => f.getGeometry() instanceof LineString) ??
          null;
        if (targetFeature) targetFeature.setGeometry(geometry);
        const length = getLength(geometry, { projection: "EPSG:3857" });
        const prevSelection = useMapStore.getState().selectedMeasurements;
        const nextSelection = updateMeasurementItemInSelection(prevSelection, {
          savedId: detail.savedId ?? null,
          unsavedId: detail.unsavedId ?? null,
          length,
          kind: "distance",
        });
        if (detail.profile && detail.profile.length > 0) {
          profileRequest.current += 1;
          useMapStore.setState({
            measure: { length, geojson: detail.geojson, kind: "distance" },
            selectedMeasurements: nextSelection,
            profile: detail.profile,
            profileError: null,
          });
        } else {
          useMapStore.setState({
            measure: { length, geojson: detail.geojson, kind: "distance" },
            selectedMeasurements: nextSelection,
            profile: null,
            profileError: null,
          });
          void fetchLineElevationProfile(geometry, profileRequest);
        }
      } catch (error) {
        console.error("Mittausgeometrian päivitys epäonnistui", error);
      }
    };

    const handleClearUnsaved = () => {
      lastRemovedUnsavedIndex = undefined;
      removeAllUnsavedMeasurements(measureSrc.current);
      profileRequest.current += 1;
    };

    window.addEventListener("remove-measurement-feature", removeMeasurementFeature);
    window.addEventListener("open-measurement-editor", handleOpenMeasurementEditor);
    window.addEventListener("replace-measurement-geometry", replaceMeasurementGeometry);
    window.addEventListener("select-linked-measurements", handleSelectLinked);
    window.addEventListener("focus-single-measurement", handleFocusSingle);
    window.addEventListener("focus-next-unsaved-measurement", handleFocusNextUnsaved);
    window.addEventListener("clear-unsaved-measurements", handleClearUnsaved);
    return () => {
      window.removeEventListener("remove-measurement-feature", removeMeasurementFeature);
      window.removeEventListener("open-measurement-editor", handleOpenMeasurementEditor);
      window.removeEventListener("replace-measurement-geometry", replaceMeasurementGeometry);
      window.removeEventListener("select-linked-measurements", handleSelectLinked);
      window.removeEventListener("focus-single-measurement", handleFocusSingle);
      window.removeEventListener("focus-next-unsaved-measurement", handleFocusNextUnsaved);
      window.removeEventListener("clear-unsaved-measurements", handleClearUnsaved);
    };
  }, [measureSrc, profileRequest]);

  useEffect(() => {
    if (pendingMarkerFeature.current) {
      featSrc.current.removeFeature(pendingMarkerFeature.current);
      pendingMarkerFeature.current = null;
    }
    if (!pendingMarker || !mapRef.current) return;
    const feature = new Feature({ geometry: new Point(fromLonLat(pendingMarker)), isPending: true });
    featSrc.current.addFeature(feature);
    pendingMarkerFeature.current = feature;
  }, [mapRef, featSrc, pendingMarkerFeature, pendingMarker]);

  useEffect(() => {
    syncRouteFeaturesToSource(
      mapRef.current,
      routeSrc.current,
      routePoints,
      routeResult,
      tool === "route",
    );
  }, [mapRef, routeSrc, routePoints, routeResult, tool]);

  useEffect(() => {
    syncHiddenEditedMeasurements(measureSrc.current, profileRequest, hiddenFeaturesSetting);
  }, [measureSrc, profileRequest, hiddenFeaturesSetting, markerFoldersSetting]);
}
