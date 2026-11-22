import { describe, expect, it } from "vitest";
import Feature from "ol/Feature";
import Draw, { DrawEvent } from "ol/interaction/Draw";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import { fromLonLat } from "ol/proj";
import { getArea, getLength } from "ol/sphere";
import VectorSource from "ol/source/Vector";
import {
  computeCursorBadgePosition,
  formatLiveMeasurementLabel,
  getSketchCursorCoordinate,
  type LiveMeasurementBadgeState,
} from "../liveMeasurementBadge";
import { formatArea, formatDistance } from "../measurementFormatting";
import { attachLiveDrawBadge } from "../../../map/hooks/liveDrawBadge";

describe("liveMeasurementBadge", () => {
  it("formats total distance across all segments of an active LineString sketch", () => {
    const a = fromLonLat([24.94, 60.17]) as [number, number];
    const b = [a[0] + 600, a[1]] as [number, number];
    const c = [a[0] + 600, a[1] + 900] as [number, number];

    const line = new LineString([a, b, c]);
    const expectedTotalM = getLength(line, { projection: "EPSG:3857" });

    expect(formatLiveMeasurementLabel(line, "metric", "auto")).toBe(
      formatDistance(expectedTotalM, "metric"),
    );
    expect(formatLiveMeasurementLabel(line, "imperial", "auto")).toBe(
      formatDistance(expectedTotalM, "imperial"),
    );
    expect(formatLiveMeasurementLabel(new LineString([a]), "metric", "auto")).toBeNull();
  });

  it("formats first leg length and polygon area for an active Polygon sketch", () => {
    const a = fromLonLat([24.94, 60.17]) as [number, number];
    const b = [a[0] + 400, a[1]] as [number, number];
    const c = [a[0] + 400, a[1] + 400] as [number, number];

    const legPoly = new Polygon([[a, b, a]]);
    const legLength = getLength(new LineString([a, b]), { projection: "EPSG:3857" });
    expect(formatLiveMeasurementLabel(legPoly, "metric", "auto")).toBe(
      formatDistance(legLength, "metric"),
    );

    const triPoly = new Polygon([[a, b, c, a]]);
    const areaM2 = getArea(triPoly, { projection: "EPSG:3857" });
    expect(formatLiveMeasurementLabel(triPoly, "metric", "auto")).toBe(
      formatArea(areaM2, "auto"),
    );
  });

  it("extracts active cursor coordinate from LineString and Polygon sketches", () => {
    const line = new LineString([
      [10, 20],
      [30, 40],
      [50, 60],
    ]);
    expect(getSketchCursorCoordinate(line)).toEqual([50, 60]);

    const poly = new Polygon([
      [
        [10, 20],
        [30, 40],
        [50, 60],
        [10, 20],
      ],
    ]);
    expect(getSketchCursorCoordinate(poly)).toEqual([50, 60]);
  });

  it("positions badge near cursor and flips away from right and bottom viewport edges", () => {
    expect(computeCursorBadgePosition(100, 120, 70, 24, 800, 600)).toEqual({
      left: 114,
      top: 134,
    });

    expect(computeCursorBadgePosition(760, 570, 70, 24, 800, 600)).toEqual({
      left: 676,
      top: 532,
    });
  });

  it("tracks live sketch updates on Draw start, geometry changes, pointer move, and clears on end/abort", () => {
    const a = fromLonLat([24.94, 60.17]) as [number, number];
    const b = [a[0] + 800, a[1]] as [number, number];
    const c = [a[0] + 800, a[1] + 800] as [number, number];

    const draw = new Draw({ source: new VectorSource(), type: "LineString" });
    const viewport = new EventTarget() as unknown as HTMLElement;
    const mapStub = {
      getEventPixel: (ev: { clientX?: number; clientY?: number }) => [ev.clientX ?? 0, ev.clientY ?? 0],
      getPixelFromCoordinate: () => [200, 220],
    } as unknown as Parameters<typeof attachLiveDrawBadge>[0];

    const updates: Array<LiveMeasurementBadgeState | null> = [];
    const cleanup = attachLiveDrawBadge(mapStub, draw, viewport, (next) => updates.push(next));

    const moveEv = Object.assign(new Event("pointermove"), { clientX: 310, clientY: 180 });
    viewport.dispatchEvent(moveEv);
    expect(updates).toHaveLength(0);

    const sketchGeom = new LineString([a, b]);
    const sketchFeature = new Feature({ geometry: sketchGeom });
    draw.dispatchEvent(new DrawEvent("drawstart", sketchFeature));

    const afterStart = updates[updates.length - 1];
    expect(afterStart).toEqual({
      label: formatDistance(getLength(sketchGeom, { projection: "EPSG:3857" }), "metric"),
      x: 310,
      y: 180,
    });

    sketchGeom.setCoordinates([a, b, c]);
    const afterAddVertex = updates[updates.length - 1];
    expect(afterAddVertex?.label).toBe(
      formatDistance(getLength(new LineString([a, b, c]), { projection: "EPSG:3857" }), "metric"),
    );

    draw.dispatchEvent(new DrawEvent("drawend", sketchFeature));
    expect(updates[updates.length - 1]).toBeNull();

    draw.dispatchEvent(new DrawEvent("drawstart", sketchFeature));
    expect(updates[updates.length - 1]).not.toBeNull();

    viewport.dispatchEvent(new Event("pointerleave"));
    expect(updates[updates.length - 1]).toBeNull();

    draw.dispatchEvent(new DrawEvent("drawabort", sketchFeature));
    expect(updates[updates.length - 1]).toBeNull();

    cleanup();
  });
});
