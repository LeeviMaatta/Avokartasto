import type Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import { getArea, getLength } from "ol/sphere";
import type VectorSource from "ol/source/Vector";
import { useMapStore } from "../../../store/mapStore";
import {
  clearSavedEditFeatures,
  ensureUnsavedMeasurementId,
  getUnsavedMeasurementFeatures,
} from "./measurementSource";
import {
  isSameMeasurementItem,
  parseMeasurementLinkKey,
  toMeasurementLinkKey,
  toggleMeasurementInSelection,
  type SelectedMeasurementItem,
} from "./measurementSelection";

function measureFeatureGeometry(feature: Feature): {
  kind: "distance" | "area";
  length: number;
  geojson: string;
} | null {
  const geom = feature.getGeometry();
  if (!(geom instanceof LineString) && !(geom instanceof Polygon)) return null;
  const kind = geom instanceof Polygon ? "area" : "distance";
  const length =
    kind === "area"
      ? getArea(geom, { projection: "EPSG:3857" })
      : getLength(geom, { projection: "EPSG:3857" });
  const geojson = new GeoJSON().writeGeometry(geom, {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });
  return { kind, length, geojson };
}

function findFeatureForItem(
  source: VectorSource,
  item: Pick<SelectedMeasurementItem, "savedId" | "unsavedId">,
): Feature | null {
  return (
    source.getFeatures().find((f) => {
      if (item.savedId !== null) {
        const rawId = f.get("id");
        return rawId !== undefined && rawId !== null && Number(rawId) === item.savedId;
      }
      return item.unsavedId !== null && f.get("unsavedId") === item.unsavedId;
    }) ?? null
  );
}

function applySingleFeatureToStore(feature: Feature, item: SelectedMeasurementItem): LineString | null {
  const metrics = measureFeatureGeometry(feature);
  if (!metrics) return null;
  const isSaved = item.savedId !== null;
  useMapStore.setState({
    pendingMarker: null,
    markerEditorOpen: false,
    measure: metrics,
    profile: null,
    profileVisible: false,
    profileError: null,
    editingFeatureId: isSaved ? item.savedId : null,
    activeUnsavedMeasurementId: isSaved ? null : item.unsavedId,
    selectedMeasurements: [{ ...item, length: metrics.length, kind: metrics.kind }],
    selectedFeature: isSaved
      ? {
          id: item.savedId!,
          kind: "measurement",
          title: String(feature.get("title") || "Mittaus"),
          description: feature.get("description") ?? null,
          color: feature.get("color") || "#dc2626",
          folder_id: feature.get("folder_id") ?? null,
          geojson: metrics.geojson,
        }
      : null,
  });
  const geom = feature.getGeometry();
  return geom instanceof LineString ? geom : null;
}

/** Handles clicking a measurement feature with optional Ctrl/Meta multi-selection. */
export function applyMeasurementClickSelection(options: {
  clickedFeature: Feature;
  measureSource: VectorSource;
  savedId: number | null;
  multiSelect: boolean;
}): LineString | null {
  const { clickedFeature, measureSource, savedId, multiSelect } = options;
  const metrics = measureFeatureGeometry(clickedFeature);
  if (!metrics) return null;
  const saved = savedId !== null && Number.isFinite(savedId);
  const unsavedId = saved ? null : ensureUnsavedMeasurementId(clickedFeature);
  const clickedItem: SelectedMeasurementItem = {
    savedId: saved ? savedId : null,
    unsavedId,
    length: metrics.length,
    kind: metrics.kind,
    title: saved ? String(clickedFeature.get("title") || "Mittaus") : undefined,
  };

  if (!multiSelect) {
    clearSavedEditFeatures(measureSource);
    let targetFeature = clickedFeature;
    if (saved) {
      const editable = clickedFeature.clone();
      editable.set("id", savedId);
      measureSource.addFeature(editable);
      targetFeature = editable;
    }
    return applySingleFeatureToStore(targetFeature, clickedItem);
  }

  const prevSelection = useMapStore.getState().selectedMeasurements;
  const nextSelection = toggleMeasurementInSelection(prevSelection, clickedItem);
  const wasAdded = nextSelection.some((item) => isSameMeasurementItem(item, clickedItem));

  if (saved) {
    if (wasAdded) {
      if (!findFeatureForItem(measureSource, clickedItem)) {
        const editable = clickedFeature.clone();
        editable.set("id", savedId);
        measureSource.addFeature(editable);
      }
    } else {
      clearSavedEditFeatures(measureSource, savedId!);
    }
  }

  if (nextSelection.length === 0) {
    useMapStore.getState().clearMeasurementSelection();
    return null;
  }

  if (nextSelection.length === 1) {
    const onlyItem = nextSelection[0];
    const onlyFeature = findFeatureForItem(measureSource, onlyItem);
    if (onlyFeature) return applySingleFeatureToStore(onlyFeature, onlyItem);
  }

  const primary = wasAdded ? clickedItem : nextSelection[nextSelection.length - 1];
  useMapStore.setState({
    pendingMarker: null,
    markerEditorOpen: false,
    profile: null,
    profileVisible: false,
    profileError: null,
    selectedMeasurements: nextSelection,
    editingFeatureId: primary.savedId,
    activeUnsavedMeasurementId: primary.savedId !== null ? null : primary.unsavedId,
    selectedFeature: null,
  });
  return null;
}

/** Selects all linked saved and/or unsaved measurements in `linkKeys`. */
export function selectLinkedMeasurements(
  measureSource: VectorSource,
  featureSource: VectorSource | null,
  linkKeys: string[],
  primaryKey: string | null,
): void {
  const parsed = linkKeys
    .map((k) => parseMeasurementLinkKey(k))
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const keepSavedIds = new Set(
    parsed.map((item) => item.savedId).filter((id): id is number => id !== null),
  );
  measureSource.getFeatures().forEach((f) => {
    const rawId = f.get("id");
    if (rawId !== undefined && rawId !== null && !keepSavedIds.has(Number(rawId))) {
      measureSource.removeFeature(f);
    }
  });

  const items: SelectedMeasurementItem[] = [];
  for (const target of parsed) {
    let feat = findFeatureForItem(measureSource, target);
    if (!feat && target.savedId !== null && featureSource) {
      const dbFeature = findFeatureForItem(featureSource, target);
      if (dbFeature) {
        const editable = dbFeature.clone();
        editable.set("id", target.savedId);
        measureSource.addFeature(editable);
        feat = editable;
      }
    }
    if (!feat) continue;
    const metrics = measureFeatureGeometry(feat);
    if (!metrics) continue;
    items.push({
      savedId: target.savedId,
      unsavedId: target.savedId !== null ? null : target.unsavedId,
      length: metrics.length,
      kind: metrics.kind,
      title: target.savedId !== null ? String(feat.get("title") || "Mittaus") : undefined,
    });
  }
  if (items.length === 0) return;
  if (items.length === 1) {
    const feat = findFeatureForItem(measureSource, items[0]);
    if (feat) applySingleFeatureToStore(feat, items[0]);
    return;
  }
  const primary =
    items.find((item) => toMeasurementLinkKey(item) === primaryKey) ?? items[items.length - 1];
  const primaryFeat = findFeatureForItem(measureSource, primary);
  const primaryMetrics = primaryFeat ? measureFeatureGeometry(primaryFeat) : null;
  useMapStore.setState({
    pendingMarker: null,
    markerEditorOpen: false,
    measure: primaryMetrics,
    profile: null,
    profileVisible: false,
    profileError: null,
    selectedMeasurements: items,
    editingFeatureId: primary.savedId,
    activeUnsavedMeasurementId: primary.savedId !== null ? null : primary.unsavedId,
    selectedFeature: null,
  });
}

/** Narrows a multi-selection down to a single measurement item. */
export function focusSingleMeasurementItem(
  measureSource: VectorSource,
  item: SelectedMeasurementItem,
): LineString | null {
  const feat = findFeatureForItem(measureSource, item);
  if (!feat) return null;
  measureSource.getFeatures().forEach((f) => {
    const rawId = f.get("id");
    if (rawId !== undefined && rawId !== null && Number(rawId) !== item.savedId) {
      measureSource.removeFeature(f);
    }
  });
  return applySingleFeatureToStore(feat, item);
}

/** Focuses the next remaining unsaved measurement in `measureSource` after deletion. */
export function focusNextUnsavedMeasurement(
  measureSource: VectorSource,
  preferredIndex?: number,
): LineString | null {
  const remaining = getUnsavedMeasurementFeatures(measureSource);
  if (remaining.length === 0) return null;
  const targetIndex =
    preferredIndex !== undefined && preferredIndex >= 0
      ? Math.min(preferredIndex, remaining.length - 1)
      : 0;
  const nextFeature = remaining[targetIndex];
  const metrics = measureFeatureGeometry(nextFeature);
  if (!metrics) return null;
  clearSavedEditFeatures(measureSource);
  const unsavedId = ensureUnsavedMeasurementId(nextFeature);
  return applySingleFeatureToStore(nextFeature, {
    savedId: null,
    unsavedId,
    length: metrics.length,
    kind: metrics.kind,
  });
}
