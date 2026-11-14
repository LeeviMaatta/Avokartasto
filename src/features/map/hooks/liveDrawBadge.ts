import type Feature from "ol/Feature";
import type OlMap from "ol/Map";
import type Draw from "ol/interaction/Draw";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import { useMapStore } from "../../../store/mapStore";
import {
  formatLiveMeasurementLabel,
  getSketchCursorCoordinate,
  type LiveMeasurementBadgeState,
} from "../../measurements/domain/liveMeasurementBadge";

/** Subscribes to an OpenLayers Draw interaction to emit live total measurement values near the cursor. */
export function attachLiveDrawBadge(
  map: OlMap,
  draw: Draw | null,
  viewport: HTMLElement,
  onUpdate: (next: LiveMeasurementBadgeState | null) => void,
): () => void {
  if (!draw) {
    onUpdate(null);
    return () => {};
  }

  let activeFeature: Feature | null = null;
  let geomListenerKey: EventsKey | null = null;
  let lastPixel: [number, number] | null = null;

  const detachGeometryListener = () => {
    if (geomListenerKey) {
      unByKey(geomListenerKey);
      geomListenerKey = null;
    }
  };

  const emitUpdate = () => {
    if (!activeFeature) {
      onUpdate(null);
      return;
    }
    const geom = activeFeature.getGeometry();
    if (!geom) {
      onUpdate(null);
      return;
    }
    const { settings } = useMapStore.getState();
    const label = formatLiveMeasurementLabel(
      geom,
      settings.measurementUnits ?? "metric",
      settings.areaUnit ?? "auto",
    );
    if (!label) {
      onUpdate(null);
      return;
    }
    let pixel = lastPixel;
    if (!pixel) {
      const coord = getSketchCursorCoordinate(geom);
      const mapped = coord ? map.getPixelFromCoordinate(coord) : null;
      if (mapped && Number.isFinite(mapped[0]) && Number.isFinite(mapped[1])) {
        pixel = [mapped[0], mapped[1]];
      }
    }
    if (!pixel) {
      onUpdate(null);
      return;
    }
    onUpdate({ label, x: pixel[0], y: pixel[1] });
  };

  const handleDrawStart = (event: { feature: Feature }) => {
    detachGeometryListener();
    activeFeature = event.feature;
    const geom = activeFeature.getGeometry();
    if (geom) {
      geomListenerKey = geom.on("change", emitUpdate);
    }
    emitUpdate();
  };

  const clearActiveDraw = () => {
    detachGeometryListener();
    activeFeature = null;
    onUpdate(null);
  };

  const handlePointerMove = (event: PointerEvent) => {
    const px = map.getEventPixel(event);
    lastPixel = [px[0], px[1]];
    if (activeFeature) emitUpdate();
  };

  const handlePointerDown = (event: PointerEvent) => {
    const px = map.getEventPixel(event);
    lastPixel = [px[0], px[1]];
  };

  const handlePointerLeave = () => {
    lastPixel = null;
    onUpdate(null);
  };

  const startKey = draw.on("drawstart", handleDrawStart);
  const endKey = draw.on("drawend", clearActiveDraw);
  const abortKey = draw.on("drawabort", clearActiveDraw);
  viewport.addEventListener("pointerdown", handlePointerDown, true);
  viewport.addEventListener("pointermove", handlePointerMove);
  viewport.addEventListener("pointerleave", handlePointerLeave);

  return () => {
    unByKey([startKey, endKey, abortKey]);
    detachGeometryListener();
    viewport.removeEventListener("pointerdown", handlePointerDown, true);
    viewport.removeEventListener("pointermove", handlePointerMove);
    viewport.removeEventListener("pointerleave", handlePointerLeave);
    activeFeature = null;
    onUpdate(null);
  };
}
