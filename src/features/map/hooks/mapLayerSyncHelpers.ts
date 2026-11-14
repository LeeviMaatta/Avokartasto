import type { MutableRefObject } from "react";
import type OlMap from "ol/Map";
import Feature from "ol/Feature";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import { fromLonLat } from "ol/proj";
import type VectorSource from "ol/source/Vector";
import { useMapStore } from "../../../store/mapStore";
import { clearSavedEditFeatures } from "../../measurements/domain/measurementSource";
import type { RoutePoint, RouteResult } from "../../routing/services/routeService";

/** Returns whether a saved feature is hidden by settings or its folder visibility. */
export function isFeatureHiddenBySettings(
  featureId: number,
  folderId: string | null | undefined,
  settings: Record<string, string>,
): boolean {
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

/** Syncs route geometry and waypoint markers onto `routeSource` and fits the view when visible. */
export function syncRouteFeaturesToSource(
  map: OlMap | null,
  routeSource: VectorSource,
  routePoints: (RoutePoint | null)[],
  routeResult: RouteResult | null,
  visible = true,
): void {
  routeSource.clear();
  if (!visible) return;
  if (routeResult && routeResult.coordinates.length >= 2) {
    const lineCoords = routeResult.coordinates.map((c) => fromLonLat(c));
    const lineFeature = new Feature({ geometry: new LineString(lineCoords) });
    routeSource.addFeature(lineFeature);
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
    routeSource.addFeature(
      new Feature({
        geometry: new Point(fromLonLat(pt.coord)),
        routeLabel: isStart ? "A" : isEnd ? "B" : String(idx),
        routeColor: isStart ? "#16a34a" : isEnd ? "#dc2626" : "#2563eb",
      }),
    );
  });
}

/** Clears hidden saved edit clones and active selection when visibility settings hide them. */
export function syncHiddenEditedMeasurements(
  measureSource: VectorSource,
  profileRequest: MutableRefObject<number>,
  hiddenFeaturesSetting?: string,
): void {
  const state = useMapStore.getState();
  try {
    const parsed = JSON.parse(hiddenFeaturesSetting ?? "[]");
    if (Array.isArray(parsed)) {
      parsed.forEach((id) => {
        if (Number.isInteger(id)) clearSavedEditFeatures(measureSource, id);
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
    clearSavedEditFeatures(measureSource, editedId);
    profileRequest.current += 1;
    useMapStore.setState({
      editingFeatureId: null,
      activeUnsavedMeasurementId: null,
      selectedMeasurements: [],
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
}
