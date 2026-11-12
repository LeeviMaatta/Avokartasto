import type OlMap from "ol/Map";
import { toLonLat } from "ol/proj";
import { useMapStore } from "../../store/mapStore";
import { useDebugStore } from "./debugStore";

let map: OlMap | null = null;
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

export function recordTileEvent(success: boolean) {
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

export function refreshDebugSnapshot() {
  const state = useMapStore.getState();
  const view = map?.getView();
  const center = view?.getCenter();
  const pointer = state.cursor;
  const layers = map?.getLayers().getArray() ?? [];
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
    "layers.total": layers.length,
    "layers.visible": layers.filter((layer) => layer.getVisible()).length,
    "layers.base": state.basemap || "Unavailable",
    "tiles.loaded": tileLoaded,
    "tiles.failed": tileFailed,
    "tiles.successRate": totalTiles ? `${Math.round((tileLoaded / totalTiles) * 100)}%` : "Unavailable",
    "network.active": networkActive,
    "network.completed": networkCompleted,
    "network.failed": networkFailed,
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
