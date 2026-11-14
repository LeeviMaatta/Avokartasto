import type Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import { getArea, getLength } from "ol/sphere";
import type VectorSource from "ol/source/Vector";
import type { SelectedMeasurementItem } from "./measurementSelection";

let unsavedSeq = 0;

/** Returns or assigns a stable client-side identifier for an unsaved measurement feature. */
export function ensureUnsavedMeasurementId(feature: Feature): string {
  const existing = feature.get("unsavedId");
  if (typeof existing === "string" && existing) return existing;
  unsavedSeq += 1;
  const id = `unsaved-${unsavedSeq}`;
  feature.set("unsavedId", id);
  return id;
}

/** Finds only the single currently selected measurement feature (`editingFeatureId` or `activeUnsavedMeasurementId`). */
export function findTargetMeasurementFeature(
  source: VectorSource,
  editingFeatureId: number | null,
  activeUnsavedMeasurementId: string | null,
): Feature | null {
  if (editingFeatureId !== null) {
    return (
      source.getFeatures().find((feat) => {
        const id = feat.get("id");
        return id !== undefined && id !== null && Number(id) === editingFeatureId;
      }) ?? null
    );
  }
  if (activeUnsavedMeasurementId) {
    return (
      source.getFeatures().find((feat) => feat.get("unsavedId") === activeUnsavedMeasurementId) ?? null
    );
  }
  return null;
}

/** Finds all measurement features matching `selectedMeasurements`, or falls back to the single target feature. */
export function findEditableMeasurementFeatures(
  source: VectorSource,
  editingFeatureId: number | null,
  activeUnsavedMeasurementId: string | null,
  selectedMeasurements: Array<{ savedId: number | null; unsavedId: string | null }>,
): Feature[] {
  if (selectedMeasurements.length > 0) {
    const matched = source.getFeatures().filter((feat) => {
      const savedId = feat.get("id");
      const unsavedId = feat.get("unsavedId");
      return selectedMeasurements.some((item) =>
        item.savedId !== null
          ? savedId !== undefined && savedId !== null && Number(savedId) === item.savedId
          : item.unsavedId !== null && unsavedId === item.unsavedId,
      );
    });
    if (matched.length > 0) return matched;
  }
  const single = findTargetMeasurementFeature(source, editingFeatureId, activeUnsavedMeasurementId);
  return single ? [single] : [];
}

/** Builds an updated selection summary item by measuring an OpenLayers feature's current geometry. */
export function buildSelectedMeasurementItem(feature: Feature): SelectedMeasurementItem | null {
  const geom = feature.getGeometry();
  if (!(geom instanceof LineString) && !(geom instanceof Polygon)) return null;
  const kind = geom instanceof Polygon ? "area" : "distance";
  const length =
    geom instanceof Polygon
      ? getArea(geom, { projection: "EPSG:3857" })
      : getLength(geom, { projection: "EPSG:3857" });
  const savedId = feature.get("id");
  const isSaved = savedId !== undefined && savedId !== null;
  const unsavedId = isSaved ? null : ensureUnsavedMeasurementId(feature);
  return {
    savedId: isSaved ? Number(savedId) : null,
    unsavedId,
    length,
    kind,
    title: isSaved ? String(feature.get("title") || "Mittaus") : undefined,
  };
}

/** Removes only temporary edit clones of saved DB features (leaving unsaved measurements intact). */
export function clearSavedEditFeatures(source: VectorSource, savedId?: number) {
  source.getFeatures().forEach((feat) => {
    const featId = feat.get("id");
    if (featId === undefined || featId === null) return;
    if (savedId === undefined || Number(featId) === savedId) {
      source.removeFeature(feat);
    }
  });
}

/** Returns all unsaved measurement features currently in `source` (excluding saved edit clones). */
export function getUnsavedMeasurementFeatures(source: VectorSource): Feature[] {
  return source.getFeatures().filter((feat) => {
    const savedId = feat.get("id");
    return savedId === undefined || savedId === null;
  });
}

/** Removes all unsaved measurement features from `source`, preserving saved edit clones. */
export function removeAllUnsavedMeasurements(source: VectorSource): number {
  const unsaved = getUnsavedMeasurementFeatures(source);
  unsaved.forEach((feat) => source.removeFeature(feat));
  return unsaved.length;
}

/** Removes a single unsaved measurement matching `unsavedId`, preserving all other measurements. */
export function removeUnsavedMeasurementById(source: VectorSource, unsavedId: string): number {
  let removed = 0;
  source.getFeatures().forEach((feat) => {
    if (feat.get("unsavedId") === unsavedId) {
      source.removeFeature(feat);
      removed += 1;
    }
  });
  return removed;
}

/** Removes unsaved measurements matching `geojson` (EPSG:4326), leaving saved edit clones and other sketches intact. */
export function removeUnsavedMeasurementByGeojson(source: VectorSource, geojson: string): number {
  if (!geojson) return 0;
  const format = new GeoJSON();
  let removed = 0;
  source.getFeatures().forEach((feat) => {
    const savedId = feat.get("id");
    if (savedId !== undefined && savedId !== null) return;
    const geom = feat.getGeometry();
    if (!geom) return;
    const featureGeojson = format.writeGeometry(geom, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });
    if (featureGeojson === geojson) {
      source.removeFeature(feat);
      removed += 1;
    }
  });
  return removed;
}

/** Parses a GeoJSON geometry string (EPSG:4326) and returns its bounding-box center as `[lon, lat]`. */
export function getFeatureFocusLonLat(geojsonStr: string): [number, number] | null {
  if (!geojsonStr) return null;
  try {
    const geometry = new GeoJSON().readGeometry(JSON.parse(geojsonStr), {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:4326",
    });
    const extent = geometry.getExtent();
    const lon = (extent[0] + extent[2]) / 2;
    const lat = (extent[1] + extent[3]) / 2;
    return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
  } catch {
    return null;
  }
}
