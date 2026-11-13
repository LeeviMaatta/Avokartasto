import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import VectorSource from "ol/source/Vector";
import { describe, expect, it } from "vitest";
import {
  clearSavedEditFeatures,
  ensureUnsavedMeasurementId,
  findTargetMeasurementFeature,
  getFeatureFocusLonLat,
  removeUnsavedMeasurementByGeojson,
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

  it("removes unsaved measurements matching geojson even if unsavedId was cleared, preserving saved clones and other sketches", () => {
    const source = new VectorSource();
    const geom1 = new LineString([[0, 0], [1000, 1000]]);
    const geom2 = new LineString([[2000, 2000], [3000, 3000]]);
    const unsaved1 = new Feature({ geometry: geom1 });
    const unsaved2 = new Feature({ geometry: geom2 });
    const savedClone = new Feature({ geometry: geom1.clone() });
    savedClone.set("id", 99);
    source.addFeatures([unsaved1, unsaved2, savedClone]);

    const geojson1 = new GeoJSON().writeGeometry(geom1, {
      dataProjection: "EPSG:4326",
      featureProjection: "EPSG:3857",
    });

    expect(removeUnsavedMeasurementByGeojson(source, geojson1)).toBe(1);
    expect(source.hasFeature(unsaved1)).toBe(false);
    expect(source.hasFeature(unsaved2)).toBe(true);
    expect(source.hasFeature(savedClone)).toBe(true);
  });

  it("extracts bounding-box center lon/lat for Point, LineString, and Polygon geometries", () => {
    expect(
      getFeatureFocusLonLat(JSON.stringify({ type: "Point", coordinates: [24.94, 60.17] })),
    ).toEqual([24.94, 60.17]);

    const lineCenter = getFeatureFocusLonLat(
      JSON.stringify({
        type: "LineString",
        coordinates: [
          [24.0, 60.0],
          [26.0, 62.0],
        ],
      }),
    );
    expect(lineCenter?.[0]).toBeCloseTo(25.0, 6);
    expect(lineCenter?.[1]).toBeCloseTo(61.0, 6);

    const polyCenter = getFeatureFocusLonLat(
      JSON.stringify({
        type: "Polygon",
        coordinates: [
          [
            [24.0, 60.0],
            [26.0, 60.0],
            [26.0, 62.0],
            [24.0, 62.0],
            [24.0, 60.0],
          ],
        ],
      }),
    );
    expect(polyCenter?.[0]).toBeCloseTo(25.0, 6);
    expect(polyCenter?.[1]).toBeCloseTo(61.0, 6);

    expect(getFeatureFocusLonLat("")).toBeNull();
    expect(getFeatureFocusLonLat("not-json")).toBeNull();
  });
});
