import Feature from "ol/Feature";
import LineString from "ol/geom/LineString";
import VectorSource from "ol/source/Vector";
import { describe, expect, it } from "vitest";
import {
  clearSavedEditFeatures,
  ensureUnsavedMeasurementId,
  findTargetMeasurementFeature,
  removeUnsavedMeasurementById,
} from "../measurementSource";

describe("measurementSource selective cleanup", () => {
  it("preserves unsaved measurements when clearing saved edit clones", () => {
    const source = new VectorSource();
    const unsaved1 = new Feature({ geometry: new LineString([[0, 0], [1, 1]]) });
    const unsaved2 = new Feature({ geometry: new LineString([[2, 2], [3, 3]]) });
    const savedClone = new Feature({ geometry: new LineString([[4, 4], [5, 5]]) });
    savedClone.set("id", 42);

    const id1 = ensureUnsavedMeasurementId(unsaved1);
    const id2 = ensureUnsavedMeasurementId(unsaved2);
    expect(id1).not.toBe(id2);
    expect(ensureUnsavedMeasurementId(unsaved1)).toBe(id1);

    source.addFeatures([unsaved1, unsaved2, savedClone]);

    clearSavedEditFeatures(source);
    expect(source.getFeatures()).toHaveLength(2);
    expect(source.hasFeature(unsaved1)).toBe(true);
    expect(source.hasFeature(unsaved2)).toBe(true);
    expect(source.hasFeature(savedClone)).toBe(false);
  });

  it("removes only the targeted unsaved measurement when deleting one of two", () => {
    const source = new VectorSource();
    const unsaved1 = new Feature({ geometry: new LineString([[0, 0], [1, 1]]) });
    const unsaved2 = new Feature({ geometry: new LineString([[2, 2], [3, 3]]) });
    const id1 = ensureUnsavedMeasurementId(unsaved1);
    ensureUnsavedMeasurementId(unsaved2);

    source.addFeatures([unsaved1, unsaved2]);

    removeUnsavedMeasurementById(source, id1);
    expect(source.getFeatures()).toHaveLength(1);
    expect(source.hasFeature(unsaved1)).toBe(false);
    expect(source.hasFeature(unsaved2)).toBe(true);
  });

  it("selects only the active unsaved or saved measurement for modification", () => {
    const source = new VectorSource();
    const unsaved1 = new Feature({ geometry: new LineString([[0, 0], [1, 1]]) });
    const unsaved2 = new Feature({ geometry: new LineString([[2, 2], [3, 3]]) });
    const savedClone = new Feature({ geometry: new LineString([[4, 4], [5, 5]]) });
    savedClone.set("id", 77);

    const id1 = ensureUnsavedMeasurementId(unsaved1);
    ensureUnsavedMeasurementId(unsaved2);
    source.addFeatures([unsaved1, unsaved2, savedClone]);

    expect(findTargetMeasurementFeature(source, null, id1)).toBe(unsaved1);
    expect(findTargetMeasurementFeature(source, 77, id1)).toBe(savedClone);
    expect(findTargetMeasurementFeature(source, null, null)).toBeNull();
  });
});
