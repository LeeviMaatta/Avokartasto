import type Feature from "ol/Feature";
import type VectorSource from "ol/source/Vector";

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

/** Removes a single unsaved measurement matching `unsavedId`, preserving all other measurements. */
export function removeUnsavedMeasurementById(source: VectorSource, unsavedId: string) {
  source.getFeatures().forEach((feat) => {
    if (feat.get("unsavedId") === unsavedId) {
      source.removeFeature(feat);
    }
  });
}
