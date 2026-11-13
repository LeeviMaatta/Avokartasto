import type OlMap from "ol/Map";
import TileLayer from "ol/layer/Tile";
import VectorTileLayer from "ol/layer/VectorTile";
import { toLonLat } from "ol/proj";
import { useMapStore } from "../../store/mapStore";
import { useDebugStore } from "./debugStore";

let map: OlMap | null = null;
let tileLoading = 0;
let tileLoaded = 0;
let tileFailed = 0;
let networkActive = 0;
let networkCompleted = 0;
let networkFailed = 0;
let frameTime = 0;
let fps = 0;
let frameHandle: number | null = null;
let previousFrame = 0;

export function setDebugMap(value: OlMap | null) {
  map = value;
}

export function recordDebugEvent(source: string, message: string, severity: "info" | "warning" | "error" = "info") {
  useDebugStore.getState().record({ source, message, severity });
}

export function recordTileStart() {
  tileLoading += 1;
}

export function recordTileEvent(success: boolean) {
  tileLoading = Math.max(0, tileLoading - 1);
  if (success) tileLoaded += 1;
  else tileFailed += 1;
}

export function setNetworkRequestActive(active: boolean, failed = false) {
  networkActive = Math.max(0, networkActive + (active ? 1 : -1));
  if (!active) {
    networkCompleted += 1;
    if (failed) networkFailed += 1;
  }
}

function frame(now: number) {
  if (previousFrame) {
    frameTime = now - previousFrame;
    fps = frameTime > 0 ? 1000 / frameTime : 0;
  }
  previousFrame = now;
  frameHandle = window.requestAnimationFrame(frame);
}

export function startPerformanceMonitor() {
  if (frameHandle === null) frameHandle = window.requestAnimationFrame(frame);
}

export function stopPerformanceMonitor() {
  if (frameHandle !== null) window.cancelAnimationFrame(frameHandle);
  frameHandle = null;
  previousFrame = 0;
  frameTime = 0;
  fps = 0;
}

export function countTilesInView(targetMap: OlMap | null): string | number | null {
  if (!targetMap) return null;
  const view = targetMap.getView();
  const size = targetMap.getSize();
  const resolution = view.getResolution();
  const projection = view.getProjection();
  if (!size || size[0] <= 0 || size[1] <= 0 || resolution === undefined || !projection) {
    return 0;
  }

  const extent = view.calculateExtent(size);
  let baseTiles = 0;
  let baseCols = 0;
  let baseRows = 0;
  let overlayTiles = 0;

  for (const layer of targetMap.getLayers().getArray()) {
    if (!layer.getVisible()) continue;
    const layerType = layer.get("avokartasto-layer-type");
    if (layerType !== "basemap" && layerType !== "overlay") continue;
    if (!(layer instanceof TileLayer) && !(layer instanceof VectorTileLayer)) continue;
    const source = layer.getSource();
    if (!source || !("getTileGridForProjection" in source)) continue;
    const tileGrid = source.getTileGridForProjection(projection);
    if (!tileGrid) continue;
    const zDirection = "zDirection" in source ? (source as { zDirection?: number }).zDirection : 0;
    const z = tileGrid.getZForResolution(resolution, zDirection);
    const range = tileGrid.getTileRangeForExtentAndZ(extent, z);
    const cols = Math.max(0, range.getWidth());
    const rows = Math.max(0, range.getHeight());
    const count = cols * rows;
    if (layerType === "basemap") {
      baseTiles += count;
      baseCols = cols;
      baseRows = rows;
    } else {
      overlayTiles += count;
    }
  }

  if (overlayTiles > 0) {
    return `${baseTiles + overlayTiles} (${baseTiles} pohja, ${overlayTiles} päällys)`;
  }
  if (baseCols > 0) {
    return `${baseTiles} (${baseCols} × ${baseRows})`;
  }
  return 0;
}

export function refreshDebugSnapshot() {
  const state = useMapStore.getState();
  const view = map?.getView();
  const center = view?.getCenter();
  const pointer = state.cursor;
  const layers = (map?.getLayers().getArray() ?? []).filter((l) => l.get("avokartasto-layer-type") !== "debug");
  const baseCount = layers.filter((l) => l.get("avokartasto-layer-type") === "basemap").length;
  const overlayCount = layers.filter((l) => l.get("avokartasto-layer-type") === "overlay").length;
  const vectorCount = layers.filter((l) => !l.get("avokartasto-layer-type")).length;
  const totalTiles = tileLoaded + tileFailed;
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;

  useDebugStore.getState().refresh({
    "map.zoom": view?.getZoom()?.toFixed(2) ?? null,
    "map.resolution": view?.getResolution()?.toFixed(2) ?? null,
    "map.viewport": map ? `${map.getSize()?.join(" x ") ?? "Unavailable"} px` : null,
    "map.center": center ? center.map((value) => value.toFixed(2)).join(", ") : null,
    "map.interacting": view?.getInteracting() ?? null,
    "coordinates.centerWgs84": center ? toLonLat(center).map((value) => value.toFixed(5)).join(", ") : null,
    "coordinates.pointerWgs84": pointer ? pointer.map((value) => value.toFixed(5)).join(", ") : null,
    "coordinates.projection": view?.getProjection().getCode() ?? "Unavailable",
    "layers.total": `${layers.length} (${baseCount} pohja, ${overlayCount} päällys, ${vectorCount} piirto)`,
    "layers.visible": `${layers.filter((layer) => layer.getVisible()).length} näkyvissä`,
    "layers.base": state.basemap || "Ei valittu",
    "layers.overlays": state.overlays.length > 0 ? `${state.overlays.length} valittuna` : "Ei valittu",
    "tiles.inView": countTilesInView(map),
    "tiles.loaded": tileLoaded,
    "tiles.loading": tileLoading,
    "tiles.failed": tileFailed,
    "tiles.successRate": totalTiles ? `${Math.round((tileLoaded / totalTiles) * 100)}%` : "–",
    "network.active": networkActive + tileLoading,
    "network.completed": networkCompleted + tileLoaded,
    "network.failed": networkFailed + tileFailed,
    "performance.fps": fps ? fps.toFixed(1) : "Unavailable",
    "performance.frameTime": frameTime ? `${frameTime.toFixed(1)} ms` : "Unavailable",
    "application.environment": (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE ?? "unknown",
    "application.viewport": `${window.innerWidth} x ${window.innerHeight}`,
    "application.pixelRatio": window.devicePixelRatio,
    "events.errors": useDebugStore.getState().events.filter((event) => event.severity === "error").length,
    "events.warnings": useDebugStore.getState().events.filter((event) => event.severity === "warning").length,
    "events.recent": useDebugStore.getState().events.slice(-3).map((event) => event.message).join(" | ") || "None",
    "resources.jsHeap": memory ? `${Math.round(memory.usedJSHeapSize / 1024 / 1024)} MB` : "Unavailable",
  });
}
