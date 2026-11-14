import { useEffect, type MutableRefObject, type RefObject } from "react";
import type OlMap from "ol/Map";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import { fromLonLat, toLonLat } from "ol/proj";
import { getLength } from "ol/sphere";
import type VectorSource from "ol/source/Vector";
import { useMapStore } from "../../../store/mapStore";
import { elevationBatch } from "../../location-info/services/elevationService";
import {
  clearSavedEditFeatures,
  findTargetMeasurementFeature,
  removeUnsavedMeasurementByGeojson,
  removeUnsavedMeasurementById,
} from "../../measurements/domain/measurementSource";
import type { RoutePoint, RouteResult } from "../../routing/services/routeService";

export async function fetchLineElevationProfile(
  geom: LineString,
  profileRequest: MutableRefObject<number>,
) {
  const length = getLength(geom, { projection: "EPSG:3857" });
  const reqId = ++profileRequest.current;
  const n = Math.min(100, Math.max(2, Math.ceil(length / 100) + 1));
  const fractions = Array.from({ length: n }, (_, i) => i / (n - 1));
  const pts = fractions.map((f) => toLonLat(geom.getCoordinateAt(f)) as [number, number]);
  try {
    const elev = await elevationBatch(pts);
    if (reqId !== profileRequest.current) return;
    useMapStore.setState({
      profile: fractions.map((f, i) => ({ dist: f * length, elev: elev[i] })),
      profileVisible: false,
    });
  } catch (err) {
    if (reqId === profileRequest.current) useMapStore.setState({ profileError: String(err) });
  }
}

export function isFeatureHiddenBySettings(
  featureId: number,
  folderId: string | null | undefined,
  settings: Record<string, string>,
) {
  try {
    const hiddenIds: unknown = JSON.parse(settings.hiddenFeatures ?? "[]");
    if (Array.isArray(hiddenIds) && hiddenIds.includes(featureId)) return true;
  } catch {
    // Sivuutetaan virheellinen JSON
  }
  if (folderId) {
    try {
      const folders = JSON.parse(settings.markerFolders ?? "[]") as Array<{
        id?: string;
        visible?: boolean;
      }>;
      if (
        Array.isArray(folders) &&
        folders.some((folder) => folder?.id === folderId && folder.visible === false)
      ) {
        return true;
      }
    } catch {
      // Sivuutetaan virheellinen JSON
    }
  }
  return false;
}

interface UseMapMeasurementSyncOptions {
  mapRef: RefObject<OlMap | null>;
  measureSrc: MutableRefObject<VectorSource>;
  featSrc: MutableRefObject<VectorSource>;
  routeSrc: MutableRefObject<VectorSource>;
  pendingMarkerFeature: MutableRefObject<Feature | null>;
  profileRequest: MutableRefObject<number>;
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
  pendingMarker,
  routePoints,
  routeResult,
  hiddenFeaturesSetting,
  markerFoldersSetting,
}: UseMapMeasurementSyncOptions) {
  useEffect(() => {
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
        if (detail?.unsavedId) removeUnsavedMeasurementById(measureSrc.current, detail.unsavedId);
        if (detail?.geojson) removeUnsavedMeasurementByGeojson(measureSrc.current, detail.geojson);
      }
      profileRequest.current += 1;
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
        if (detail.profile && detail.profile.length > 0) {
          profileRequest.current += 1;
          useMapStore.setState({
            measure: { length, geojson: detail.geojson, kind: "distance" },
            profile: detail.profile,
            profileError: null,
          });
        } else {
          useMapStore.setState({
            measure: { length, geojson: detail.geojson, kind: "distance" },
            profile: null,
            profileError: null,
          });
          void fetchLineElevationProfile(geometry, profileRequest);
        }
      } catch (error) {
        console.error("Mittausgeometrian päivitys epäonnistui", error);
      }
    };

    window.addEventListener("remove-measurement-feature", removeMeasurementFeature);
    window.addEventListener("open-measurement-editor", handleOpenMeasurementEditor);
    window.addEventListener("replace-measurement-geometry", replaceMeasurementGeometry);
    return () => {
      window.removeEventListener("remove-measurement-feature", removeMeasurementFeature);
      window.removeEventListener("open-measurement-editor", handleOpenMeasurementEditor);
      window.removeEventListener("replace-measurement-geometry", replaceMeasurementGeometry);
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
    routeSrc.current.clear();
    if (routeResult && routeResult.coordinates.length >= 2) {
      const lineCoords = routeResult.coordinates.map((c) => fromLonLat(c));
      const lineFeature = new Feature({ geometry: new LineString(lineCoords) });
      routeSrc.current.addFeature(lineFeature);
      const map = mapRef.current;
      if (map) {
        const extent = lineFeature.getGeometry()?.getExtent();
        if (extent) {
          map.getView().fit(extent, { padding: [80, 80, 80, 80], duration: 400, maxZoom: 15 });
        }
      }
    }
    routePoints.forEach((pt, idx) => {
      if (!pt) return;
      const isStart = idx === 0;
      const isEnd = idx === routePoints.length - 1;
      routeSrc.current.addFeature(
        new Feature({
          geometry: new Point(fromLonLat(pt.coord)),
          routeLabel: isStart ? "A" : isEnd ? "B" : String(idx),
          routeColor: isStart ? "#16a34a" : isEnd ? "#dc2626" : "#2563eb",
        }),
      );
    });
  }, [mapRef, routeSrc, routePoints, routeResult]);

  useEffect(() => {
    const state = useMapStore.getState();
    try {
      const parsed = JSON.parse(hiddenFeaturesSetting ?? "[]");
      if (Array.isArray(parsed)) {
        parsed.forEach((id) => {
          if (Number.isInteger(id)) clearSavedEditFeatures(measureSrc.current, id);
        });
      }
    } catch {
      // Sivuutetaan virheellinen JSON
    }
    const editedId = state.editingFeatureId;
    if (
      editedId !== null &&
      isFeatureHiddenBySettings(editedId, state.selectedFeature?.folder_id, state.settings)
    ) {
      clearSavedEditFeatures(measureSrc.current, editedId);
      profileRequest.current += 1;
      useMapStore.setState({
        editingFeatureId: null,
        measure: null,
        profile: null,
        profileVisible: false,
        profileError: null,
        selectedFeature: null,
      });
      return;
    }
    const sel = state.selectedFeature;
    if (sel && isFeatureHiddenBySettings(sel.id, sel.folder_id, state.settings)) {
      useMapStore.setState({ selectedFeature: null });
    }
  }, [measureSrc, profileRequest, hiddenFeaturesSetting, markerFoldersSetting]);
}
