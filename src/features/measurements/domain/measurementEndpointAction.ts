import type OlMap from "ol/Map";
import type Feature from "ol/Feature";
import LineString from "ol/geom/LineString";
import type VectorSource from "ol/source/Vector";

export interface MeasurementEndpointHit {
  feature: Feature;
  coord: [number, number];
  unsavedId: string | null;
  savedId: number | null;
}

export interface EndpointCandidate {
  pixel: [number, number];
  coord: [number, number];
  unsavedId: string | null;
  savedId: number | null;
  distancePx: number;
  feature?: Feature;
}

let suppressSingleClickUntilMs = 0;
let activeDrawingMeasurement = false;

/** Marks whether an OpenLayers Draw interaction is currently placing vertices. */
export function setActiveDrawingMeasurement(drawing: boolean): void {
  activeDrawingMeasurement = drawing;
}

/** Returns true while a measurement Draw interaction is actively placing vertices. */
export function isActiveDrawingMeasurement(): boolean {
  return activeDrawingMeasurement;
}

/** Suppresses the delayed OpenLayers singleclick event after an endpoint click starts a new measurement. */
export function suppressMeasurementSingleClick(durationMs = 350): void {
  suppressSingleClickUntilMs = Date.now() + durationMs;
}

/** Checks whether singleclick feature selection should be ignored for the current click. */
export function shouldIgnoreMeasurementSingleClick(): boolean {
  return activeDrawingMeasurement || Date.now() < suppressSingleClickUntilMs;
}

/** Checks whether pointerdown -> pointerup stayed within the click threshold (not a vertex drag). */
export function isClickWithoutDrag(
  downPixel: readonly [number, number],
  upPixel: readonly [number, number],
  maxMovePx = 5,
): boolean {
  const dx = upPixel[0] - downPixel[0];
  const dy = upPixel[1] - downPixel[1];
  return dx * dx + dy * dy <= maxMovePx * maxMovePx;
}

/** Finds the closest start/end vertex among endpoint candidates within `tolerancePx`. */
export function findClosestEndpointCandidate(
  candidates: EndpointCandidate[],
  clickPixel: readonly [number, number],
  tolerancePx = 12,
): EndpointCandidate | null {
  let best: EndpointCandidate | null = null;
  for (const candidate of candidates) {
    const dx = candidate.pixel[0] - clickPixel[0];
    const dy = candidate.pixel[1] - clickPixel[1];
    const dist = Math.hypot(dx, dy);
    if (dist <= tolerancePx && (!best || dist < best.distancePx)) {
      best = { ...candidate, distancePx: dist };
    }
  }
  return best;
}

function collectSourceFeatures(sources: VectorSource | VectorSource[]): Feature[] {
  const list = Array.isArray(sources) ? sources : [sources];
  if (list.length <= 1) return list[0]?.getFeatures() ?? [];
  const features: Feature[] = [];
  const seenSavedIds = new Set<number>();
  for (const source of list) {
    for (const feat of source.getFeatures()) {
      const rawSaved = feat.get("id");
      if (rawSaved !== undefined && rawSaved !== null) {
        const numId = Number(rawSaved);
        if (seenSavedIds.has(numId)) continue;
        seenSavedIds.add(numId);
      }
      features.push(feat);
    }
  }
  return features;
}

/** Finds a start or end vertex of any LineString measurement in `sources` near `pixel`. */
export function findMeasurementEndpointAtPixel(
  map: OlMap,
  sources: VectorSource | VectorSource[],
  pixel: readonly [number, number],
  tolerancePx = 12,
): MeasurementEndpointHit | null {
  const candidates: EndpointCandidate[] = [];
  for (const feature of collectSourceFeatures(sources)) {
    const geom = feature.getGeometry();
    if (!(geom instanceof LineString)) continue;
    const coords = geom.getCoordinates();
    if (coords.length < 2) continue;
    const rawUnsaved = feature.get("unsavedId");
    const unsavedId = typeof rawUnsaved === "string" && rawUnsaved ? rawUnsaved : null;
    const rawSaved = feature.get("id");
    const savedId = rawSaved !== undefined && rawSaved !== null ? Number(rawSaved) : null;
    for (const rawCoord of [coords[0], coords[coords.length - 1]]) {
      const px = map.getPixelFromCoordinate(rawCoord);
      if (!px) continue;
      candidates.push({
        pixel: [px[0], px[1]],
        coord: [rawCoord[0], rawCoord[1]],
        unsavedId,
        savedId,
        distancePx: Infinity,
        feature,
      });
    }
  }
  const best = findClosestEndpointCandidate(candidates, pixel, tolerancePx);
  if (!best?.feature) return null;
  return {
    feature: best.feature,
    coord: best.coord,
    unsavedId: best.unsavedId,
    savedId: best.savedId,
  };
}

/** Finds all LineString measurement features in `sources` whose start or end vertex matches `coord`. */
export function findMatchingEndpointFeatures(
  sources: VectorSource | VectorSource[],
  coord: readonly [number, number],
  toleranceM = 0.05,
): Feature[] {
  const matched: Feature[] = [];
  for (const feature of collectSourceFeatures(sources)) {
    const geom = feature.getGeometry();
    if (!(geom instanceof LineString)) continue;
    const coords = geom.getCoordinates();
    if (coords.length < 2) continue;
    const endpoints = [coords[0], coords[coords.length - 1]];
    const hitsJunction = endpoints.some(
      (pt) => Math.hypot(pt[0] - coord[0], pt[1] - coord[1]) <= toleranceM,
    );
    if (hitsJunction) matched.push(feature);
  }
  return matched;
}
