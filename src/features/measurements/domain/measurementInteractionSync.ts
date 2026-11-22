import type { MutableRefObject } from "react";
import type Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import { getArea, getLength } from "ol/sphere";
import type VectorSource from "ol/source/Vector";
import { useMapStore } from "../../../store/mapStore";
import { fetchLineElevationProfile } from "./measurementProfile";
import {
  mergeMeasurementSelection,
  updateMeasurementItemInSelection,
} from "./measurementSelection";
import { buildSelectedMeasurementItem, ensureUnsavedMeasurementId } from "./measurementSource";

/** Pushes a drawn or modified single measurement feature to store state and fetches elevation profile. */
export async function syncMeasurementFeatureToStore(
  feature: Feature,
  profileRequest: MutableRefObject<number>,
  preserveMultiSelection: boolean,
): Promise<void> {
  const geom = feature.getGeometry();
  if (!(geom instanceof LineString) && !(geom instanceof Polygon)) return;
  const kind = geom instanceof Polygon ? "area" : "distance";
  const length =
    geom instanceof Polygon
      ? getArea(geom, { projection: "EPSG:3857" })
      : getLength(geom, { projection: "EPSG:3857" });
  const geojson = new GeoJSON().writeGeometry(geom, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });
  profileRequest.current += 1;
  const savedId = feature.get("id");
  const isSaved = savedId !== undefined && savedId !== null;
  const nextUnsavedId = isSaved ? null : ensureUnsavedMeasurementId(feature);
  const item = {
    savedId: isSaved ? Number(savedId) : null,
    unsavedId: nextUnsavedId,
    length,
    kind,
    title: isSaved ? String(feature.get("title") || "Mittaus") : undefined,
  } as const;
  const prevSelection = useMapStore.getState().selectedMeasurements;
  const nextSelection = preserveMultiSelection
    ? updateMeasurementItemInSelection(prevSelection, item)
    : [item];
  useMapStore.setState({
    measure: { length, geojson, kind },
    profile: null,
    profileVisible: false,
    profileError: null,
    selectedMeasurements: nextSelection,
    ...(isSaved
      ? { editingFeatureId: Number(savedId), activeUnsavedMeasurementId: null }
      : { editingFeatureId: null, activeUnsavedMeasurementId: nextUnsavedId, selectedFeature: null }),
  });
  if (kind !== "area" && geom instanceof LineString) {
    await fetchLineElevationProfile(geom, profileRequest);
  }
}

/** Updates store metrics for all modified features when multi-selection editing finishes. */
export function updateMultiModifiedMeasurements(features: Feature[]): void {
  const state = useMapStore.getState();
  let nextSelection = state.selectedMeasurements;
  for (const feat of features) {
    const item = buildSelectedMeasurementItem(feat);
    if (item) nextSelection = updateMeasurementItemInSelection(nextSelection, item);
  }
  useMapStore.setState({ selectedMeasurements: nextSelection });
}

/** Auto-selects all connected measurements sharing a dragged junction vertex. */
export function selectJunctionMeasurements(features: Feature[]): void {
  const additions = features
    .map((feat) => buildSelectedMeasurementItem(feat))
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const prevSelection = useMapStore.getState().selectedMeasurements;
  const nextSelection = mergeMeasurementSelection(prevSelection, additions);
  if (nextSelection !== prevSelection) {
    useMapStore.setState({
      selectedMeasurements: nextSelection,
      ...(nextSelection.length > 1 ? { selectedFeature: null } : {}),
    });
  }
}

/** Clones a DB feature into `measureSource` for temporary junction editing if not already present. */
export function prepareJunctionFeaturesForModify(
  sharedFeatures: Feature[],
  measureSource: VectorSource,
): { resolved: Feature[]; tempClonedSavedIds: number[] } {
  const tempClonedSavedIds: number[] = [];
  const resolved = sharedFeatures.map((feat) => {
    if (measureSource.hasFeature(feat)) return feat;
    const rawSaved = feat.get("id");
    if (rawSaved !== undefined && rawSaved !== null) {
      const savedId = Number(rawSaved);
      const clone = feat.clone();
      clone.set("id", savedId);
      measureSource.addFeature(clone);
      tempClonedSavedIds.push(savedId);
      return clone;
    }
    return feat;
  });
  return { resolved, tempClonedSavedIds };
}
