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
  getUnsavedMeasurementFeatures,
  removeAllUnsavedMeasurements,
  removeUnsavedMeasurementByGeojson,
  removeUnsavedMeasurementById,
} from "../measurementSource";
import { findMatchingEndpointFeatures } from "../measurementEndpointAction";
import { focusNextUnsavedMeasurement, selectLinkedMeasurements } from "../measurementClickSelect";
import { useMapStore } from "../../../../store/mapStore";

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

  it("finds all features sharing a junction endpoint and removes only unsaved features on bulk clear", () => {
    const source = new VectorSource();
    const shared: [number, number] = [100, 100];
    const m1 = new Feature({ geometry: new LineString([[0, 0], shared]) });
    const m2 = new Feature({ geometry: new LineString([shared, [200, 200]]) });
    const m3 = new Feature({ geometry: new LineString([[500, 500], [600, 600]]) });
    const savedClone = new Feature({ geometry: new LineString([[300, 300], [400, 400]]) });
    savedClone.set("id", 55);
    ensureUnsavedMeasurementId(m1);
    ensureUnsavedMeasurementId(m2);
    ensureUnsavedMeasurementId(m3);
    source.addFeatures([m1, m2, m3, savedClone]);

    expect(findMatchingEndpointFeatures(source, shared, 0.05)).toEqual([m1, m2]);

    expect(removeAllUnsavedMeasurements(source)).toBe(3);
    expect(source.getFeatures()).toEqual([savedClone]);
  });

  it("deduplicates saved features across sources and clones linked saved measurements on group selection", () => {
    const measureSource = new VectorSource();
    const featureSource = new VectorSource();
    const shared: [number, number] = [100, 100];

    const unsaved = new Feature({ geometry: new LineString([shared, [200, 200]]) });
    const id1 = ensureUnsavedMeasurementId(unsaved);
    measureSource.addFeature(unsaved);

    const savedDb = new Feature({ geometry: new LineString([[0, 0], shared]) });
    savedDb.set("id", 55);
    savedDb.set("title", "Tallennettu");
    const savedClone = new Feature({ geometry: new LineString([[0, 0], shared]) });
    savedClone.set("id", 55);
    featureSource.addFeature(savedDb);
    measureSource.addFeature(savedClone);

    const matched = findMatchingEndpointFeatures([measureSource, featureSource], shared, 0.05);
    expect(matched).toHaveLength(2);
    expect(matched).toEqual([unsaved, savedClone]);

    measureSource.removeFeature(savedClone);
    selectLinkedMeasurements(measureSource, featureSource, ["saved:55", id1], id1);

    const state = useMapStore.getState();
    expect(state.selectedMeasurements.map((m) => m.savedId ?? m.unsavedId)).toEqual([55, id1]);
    expect(state.activeUnsavedMeasurementId).toBe(id1);
    expect(measureSource.getFeatures().some((f) => f.get("id") === 55)).toBe(true);

    useMapStore.setState({
      selectedMeasurements: [],
      editingFeatureId: null,
      activeUnsavedMeasurementId: null,
      measure: null,
    });
  });

  it("focuses the next remaining unsaved measurement after deletion", () => {
    const source = new VectorSource();
    const u1 = new Feature({ geometry: new LineString([[0, 0], [100, 0]]) });
    const u2 = new Feature({ geometry: new LineString([[0, 0], [200, 0]]) });
    const u3 = new Feature({ geometry: new LineString([[0, 0], [300, 0]]) });
    const savedClone = new Feature({ geometry: new LineString([[0, 0], [400, 0]]) });
    savedClone.set("id", 77);
    const id1 = ensureUnsavedMeasurementId(u1);
    const id2 = ensureUnsavedMeasurementId(u2);
    const id3 = ensureUnsavedMeasurementId(u3);
    source.addFeatures([u1, u2, u3, savedClone]);

    expect(getUnsavedMeasurementFeatures(source)).toEqual([u1, u2, u3]);

    // Remove middle (index 1 -> u2) -> should focus u3
    source.removeFeature(u2);
    const lineA = focusNextUnsavedMeasurement(source, 1);
    expect(lineA).toBeInstanceOf(LineString);
    expect(useMapStore.getState().activeUnsavedMeasurementId).toBe(id3);
    expect(useMapStore.getState().selectedMeasurements.map((m) => m.unsavedId)).toEqual([id3]);
    expect(source.getFeatures().some((f) => f.get("id") === 77)).toBe(false);

    // Remove last remaining (index 1 -> u3) -> should clamp to u1
    source.removeFeature(u3);
    const lineB = focusNextUnsavedMeasurement(source, 1);
    expect(lineB).toBeInstanceOf(LineString);
    expect(useMapStore.getState().activeUnsavedMeasurementId).toBe(id1);

    // Remove final unsaved -> returns null
    source.removeFeature(u1);
    expect(focusNextUnsavedMeasurement(source, 0)).toBeNull();
    expect(id2).toBeTruthy();

    useMapStore.setState({
      selectedMeasurements: [],
      editingFeatureId: null,
      activeUnsavedMeasurementId: null,
      measure: null,
    });
  });
});
