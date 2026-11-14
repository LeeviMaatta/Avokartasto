import { describe, expect, it } from "vitest";
import Feature from "ol/Feature";
import LineString from "ol/geom/LineString";
import { fromLonLat } from "ol/proj";
import { getLength } from "ol/sphere";
import {
  computeLogicalMeasurementSegments,
  isSelectedMeasurementFeature,
  measurementStyle,
} from "../featureStyles";

describe("featureStyles segment spacing and zoom visibility", () => {
  it("accumulates curved/angled segments along the true path when skipping intermediate points", () => {
    const base = fromLonLat([24.94, 60.17]) as [number, number];
    // 10 kpl n. 100 m pituisia mutkittelevia välejä (kokonaispituus > suora etäisyys)
    const coords: [number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const dx = i * 170;
      const dy = (i % 2 === 0 ? 0 : 120);
      coords.push([base[0] + dx, base[1] + dy]);
    }

    const line = new LineString(coords);
    const exactTotalLength = getLength(line, { projection: "EPSG:3857" });

    const grouped = computeLogicalMeasurementSegments(coords, 500);
    expect(grouped.length).toBeLessThan(10);
    expect(grouped.length).toBeGreaterThanOrEqual(2);
    const groupedSum = grouped.reduce((acc, s) => acc + s.lengthM, 0);
    expect(groupedSum).toBeCloseTo(exactTotalLength, 4);

    // Suora etäisyys päätepisteiden välillä olisi huomattavasti lyhyempi kuin käyrän todellinen pituus
    const straightDist = getLength(new LineString([coords[0], coords[coords.length - 1]]), {
      projection: "EPSG:3857",
    });
    expect(groupedSum).toBeGreaterThan(straightDist * 1.1);

    const allSegments = computeLogicalMeasurementSegments(coords, 0);
    expect(allSegments).toHaveLength(10);
    const allSum = allSegments.reduce((acc, s) => acc + s.lengthM, 0);
    expect(allSum).toBeCloseTo(exactTotalLength, 4);
  });

  it("hides segment labels when zoomed out below minZoomForSegments and shows them at or above", () => {
    const a = fromLonLat([24.94, 60.17]) as [number, number];
    const b = fromLonLat([24.95, 60.17]) as [number, number];
    const feature = new Feature({ geometry: new LineString([a, b]) });

    const styleFn = measurementStyle("#2563eb", true, "metric", {
      minSegmentDistanceM: 500,
      hideByZoom: true,
      minZoomForSegments: 13,
    });

    const resZ11 = 156543.03392804097 / 2 ** 11;
    const resZ13 = 156543.03392804097 / 2 ** 13;

    const stylesAtZ11 = styleFn(feature, resZ11);
    expect(Array.isArray(stylesAtZ11) ? stylesAtZ11.length : 1).toBe(1);

    const stylesAtZ13 = styleFn(feature, resZ13);
    expect(Array.isArray(stylesAtZ13) ? stylesAtZ13.length : 1).toBeGreaterThan(1);

    const alwaysShownFn = measurementStyle("#2563eb", true, "metric", {
      minSegmentDistanceM: 500,
      hideByZoom: false,
      minZoomForSegments: 13,
    });
    const stylesAlwaysAtZ11 = alwaysShownFn(feature, resZ11);
    expect(Array.isArray(stylesAlwaysAtZ11) ? stylesAlwaysAtZ11.length : 1).toBeGreaterThan(1);
  });

  it("renders segment distance labels only for the currently selected measurement", () => {
    const a = fromLonLat([24.94, 60.17]) as [number, number];
    const b = fromLonLat([24.95, 60.17]) as [number, number];
    const resZ14 = 156543.03392804097 / 2 ** 14;

    const unsaved1 = new Feature({ geometry: new LineString([a, b]), unsavedId: "unsaved-1" });
    const unsaved2 = new Feature({ geometry: new LineString([a, b]), unsavedId: "unsaved-2" });
    const saved5 = new Feature({ geometry: new LineString([a, b]), id: 5 });

    const styleWithSelection = (editingId: number | null, activeUnsavedId: string | null) =>
      measurementStyle({ saved: "#16a34a", unsaved: "#2563eb" }, true, "metric", {
        minSegmentDistanceM: 500,
        hideByZoom: true,
        minZoomForSegments: 13,
        isSelectedFeature: (f) => isSelectedMeasurementFeature(f, editingId, activeUnsavedId),
      });

    const whenUnsaved1Selected = styleWithSelection(null, "unsaved-1");
    expect((whenUnsaved1Selected(unsaved1, resZ14) as unknown[]).length).toBeGreaterThan(1);
    expect((whenUnsaved1Selected(unsaved2, resZ14) as unknown[]).length).toBe(1);
    expect((whenUnsaved1Selected(saved5, resZ14) as unknown[]).length).toBe(1);

    const whenSaved5Selected = styleWithSelection(5, null);
    expect((whenSaved5Selected(saved5, resZ14) as unknown[]).length).toBeGreaterThan(1);
    expect((whenSaved5Selected(unsaved1, resZ14) as unknown[]).length).toBe(1);

    const whenNoneSelected = styleWithSelection(null, null);
    expect((whenNoneSelected(unsaved1, resZ14) as unknown[]).length).toBe(1);
    expect((whenNoneSelected(saved5, resZ14) as unknown[]).length).toBe(1);
  });
});
