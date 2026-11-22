import type Geometry from "ol/geom/Geometry";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import { getArea, getLength } from "ol/sphere";
import { formatArea, formatDistance } from "./measurementFormatting";

export interface LiveMeasurementBadgeState {
  label: string;
  x: number;
  y: number;
}

const CURSOR_OFFSET_X = 14;
const CURSOR_OFFSET_Y = 14;
const VIEWPORT_PADDING = 8;

/** Formats the live total length (or area once a polygon has >= 3 vertices) for an active measurement sketch. */
export function formatLiveMeasurementLabel(
  geom: Geometry,
  units = "metric",
  areaUnit = "auto",
): string | null {
  if (geom instanceof LineString) {
    const coords = geom.getCoordinates();
    if (coords.length < 2) return null;
    const lengthM = getLength(geom, { projection: "EPSG:3857" });
    return formatDistance(lengthM, units);
  }
  if (geom instanceof Polygon) {
    const ring = geom.getCoordinates()[0] ?? [];
    if (ring.length < 3) return null;
    const areaM2 = getArea(geom, { projection: "EPSG:3857" });
    if (ring.length >= 4 && areaM2 > 0) {
      return formatArea(areaM2, areaUnit);
    }
    const legM = getLength(new LineString(ring.slice(0, 2)), { projection: "EPSG:3857" });
    return formatDistance(legM, units);
  }
  return null;
}

/** Returns the active cursor vertex coordinate from a drawing sketch geometry. */
export function getSketchCursorCoordinate(geom: Geometry): [number, number] | null {
  if (geom instanceof LineString) {
    const coords = geom.getCoordinates();
    if (coords.length === 0) return null;
    const last = coords[coords.length - 1];
    return [last[0], last[1]];
  }
  if (geom instanceof Polygon) {
    const ring = geom.getCoordinates()[0] ?? [];
    if (ring.length < 2) return null;
    const active = ring[ring.length - 2];
    return [active[0], active[1]];
  }
  return null;
}

/** Computes a viewport-clamped position next to the cursor, flipping sides near map edges. */
export function computeCursorBadgePosition(
  cursorX: number,
  cursorY: number,
  badgeWidth: number,
  badgeHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { left: number; top: number } {
  let left = cursorX + CURSOR_OFFSET_X;
  if (viewportWidth > 0 && left + badgeWidth > viewportWidth - VIEWPORT_PADDING) {
    left = cursorX - CURSOR_OFFSET_X - badgeWidth;
  }
  left = Math.max(VIEWPORT_PADDING, left);

  let top = cursorY + CURSOR_OFFSET_Y;
  if (viewportHeight > 0 && top + badgeHeight > viewportHeight - VIEWPORT_PADDING) {
    top = cursorY - CURSOR_OFFSET_Y - badgeHeight;
  }
  top = Math.max(VIEWPORT_PADDING, top);

  return { left, top };
}
