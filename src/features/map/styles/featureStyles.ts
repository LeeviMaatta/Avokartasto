import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapPin } from "lucide-react";
import { Circle as CircleStyle, Fill, Icon, Stroke, Style, Text } from "ol/style";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import { getLength } from "ol/sphere";
import { formatDistance } from "../../measurements/domain/measurementFormatting";

export const lineStyle = (color: string) =>
  new Style({
    stroke: new Stroke({ color, width: 3 }),
    fill: new Fill({ color: `${color}33` }),
    image: new CircleStyle({ radius: 5, fill: new Fill({ color }), stroke: new Stroke({ color: "#fff", width: 2 }) }),
  });

export interface LogicalMeasurementSegment {
  startIdx: number;
  endIdx: number;
  lengthM: number;
  midpoint: [number, number];
  startCoord: [number, number];
  endCoord: [number, number];
}

export function computeLogicalMeasurementSegments(
  coords: number[][],
  minDistanceM = 500,
): LogicalMeasurementSegment[] {
  if (coords.length < 2) return [];

  const segLengths: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const len = getLength(new LineString([coords[i], coords[i + 1]]), { projection: "EPSG:3857" });
    segLengths.push(len);
    totalLen += len;
  }
  if (totalLen <= 2) return [];

  const threshold = Math.max(0, Number.isFinite(minDistanceM) ? minDistanceM : 500);
  const ranges: { startIdx: number; endIdx: number; lengthM: number }[] = [];
  let startIdx = 0;
  let accLen = 0;

  for (let i = 0; i < segLengths.length; i++) {
    accLen += segLengths[i];
    if (threshold <= 0) {
      if (accLen > 2) {
        ranges.push({ startIdx, endIdx: i + 1, lengthM: accLen });
        startIdx = i + 1;
        accLen = 0;
      }
    } else if (accLen >= threshold) {
      ranges.push({ startIdx, endIdx: i + 1, lengthM: accLen });
      startIdx = i + 1;
      accLen = 0;
    }
  }

  if (accLen > 0) {
    if (ranges.length === 0) {
      if (accLen > 2) {
        ranges.push({ startIdx: 0, endIdx: coords.length - 1, lengthM: accLen });
      }
    } else if (accLen < Math.max(2, threshold * 0.35)) {
      const last = ranges[ranges.length - 1];
      last.endIdx = coords.length - 1;
      last.lengthM += accLen;
    } else {
      ranges.push({ startIdx, endIdx: coords.length - 1, lengthM: accLen });
    }
  }

  return ranges.map((range) => {
    const targetHalf = range.lengthM * 0.5;
    let walked = 0;
    let midpoint: [number, number] = [
      (coords[range.startIdx][0] + coords[range.endIdx][0]) / 2,
      (coords[range.startIdx][1] + coords[range.endIdx][1]) / 2,
    ];
    for (let j = range.startIdx; j < range.endIdx; j++) {
      const segLen = segLengths[j];
      if (walked + segLen >= targetHalf) {
        const frac = segLen > 0 ? (targetHalf - walked) / segLen : 0.5;
        const c1 = coords[j];
        const c2 = coords[j + 1];
        midpoint = [c1[0] + (c2[0] - c1[0]) * frac, c1[1] + (c2[1] - c1[1]) * frac];
        break;
      }
      walked += segLen;
    }
    return {
      startIdx: range.startIdx,
      endIdx: range.endIdx,
      lengthM: range.lengthM,
      midpoint,
      startCoord: [coords[range.startIdx][0], coords[range.startIdx][1]],
      endCoord: [coords[range.endIdx][0], coords[range.endIdx][1]],
    };
  });
}

export interface MeasurementStyleOptions {
  minSegmentDistanceM?: number;
  hideByZoom?: boolean;
  minZoomForSegments?: number;
  isSelectedFeature?: (feature: any) => boolean;
}

/** Checks whether a measurement feature matches the currently selected saved or unsaved measurement. */
export function isSelectedMeasurementFeature(
  feature: any,
  editingFeatureId: number | null,
  activeUnsavedMeasurementId: string | null,
): boolean {
  const savedId = feature?.get?.("id");
  if (savedId !== undefined && savedId !== null) {
    return editingFeatureId !== null && Number(savedId) === editingFeatureId;
  }
  const unsavedId = feature?.get?.("unsavedId");
  return (
    typeof unsavedId === "string" &&
    unsavedId.length > 0 &&
    activeUnsavedMeasurementId !== null &&
    unsavedId === activeUnsavedMeasurementId
  );
}

export const measurementStyle = (
  color: string | { saved: string; unsaved: string },
  showSegments: boolean,
  units = "metric",
  options?: MeasurementStyleOptions,
) => {
  const savedColor = typeof color === "string" ? color : color.saved;
  const unsavedColor = typeof color === "string" ? color : color.unsaved;
  const savedBase = lineStyle(savedColor);
  const unsavedBase = lineStyle(unsavedColor);
  const minSegmentDistanceM = options?.minSegmentDistanceM ?? 500;
  const hideByZoom = options?.hideByZoom ?? true;
  const minZoomForSegments = options?.minZoomForSegments ?? 13;

  return (feature: any, resolution?: number) => {
    const geom = feature?.getGeometry?.();
    const isSaved = feature?.get?.("id") !== undefined && feature?.get?.("id") !== null;
    const base = isSaved ? savedBase : unsavedBase;
    const strokeColor = isSaved ? savedColor : unsavedColor;
    if (!geom) return base;
    const styles: Style[] = [base];

    const currentZoom =
      typeof resolution === "number" && resolution > 0
        ? Math.log2(156543.03392804097 / resolution)
        : Infinity;
    const zoomAllowsSegments = !hideByZoom || currentZoom >= minZoomForSegments - 1e-6;
    const featureSelected = options?.isSelectedFeature ? options.isSelectedFeature(feature) : true;

    if (showSegments && featureSelected && zoomAllowsSegments && geom instanceof LineString) {
      const coords = geom.getCoordinates();
      const segments = computeLogicalMeasurementSegments(coords, minSegmentDistanceM);
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const nextSeg = segments[i + 1];
        if (
          i < segments.length - 1 &&
          (seg.endIdx - seg.startIdx > 1 || (nextSeg && nextSeg.endIdx - nextSeg.startIdx > 1))
        ) {
          styles.push(
            new Style({
              geometry: new Point(seg.endCoord),
              image: new CircleStyle({
                radius: 3.5,
                fill: new Fill({ color: strokeColor }),
                stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
              }),
            }),
          );
        }
        styles.push(
          new Style({
            geometry: new Point(seg.midpoint),
            text: new Text({
              text: formatDistance(seg.lengthM, units),
              font: "bold 11px system-ui, -apple-system, sans-serif",
              fill: new Fill({ color: "#0f172a" }),
              stroke: new Stroke({ color: "#ffffff", width: 3 }),
              backgroundFill: new Fill({ color: "rgba(255, 255, 255, 0.9)" }),
              backgroundStroke: new Stroke({ color: "#94a3b8", width: 1 }),
              padding: [2, 4, 1, 4],
              offsetY: -7,
            }),
          }),
        );
      }
    }
    return styles;
  };
};

const markerStyleCache = new Map<string, Style>();

function buildMarkerSvg(color: string, theme: "light" | "dark"): string {
  const inner = theme === "dark" ? "#e4e4e7" : "#ffffff";
  const svg = renderToStaticMarkup(
    createElement(MapPin, {
      size: 32,
      color,
      fill: color,
      strokeWidth: 2,
    }),
  );
  return svg.replace("<circle ", `<circle stroke="${inner}" `);
}

export const markerStyle = (
  color: string,
  theme: "light" | "dark" = "light",
) => {
  const key = `${color}:${theme}`;
  const cached = markerStyleCache.get(key);
  if (cached) return cached;
  const style = new Style({
    image: new Icon({
      src: `data:image/svg+xml,${encodeURIComponent(buildMarkerSvg(color, theme))}`,
      anchor: [0.5, 0.92],
    }),
  });
  markerStyleCache.set(key, style);
  return style;
};
