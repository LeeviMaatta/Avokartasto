import { useEffect, type RefObject } from "react";
import type OlMap from "ol/Map";
import ImageLayer from "ol/layer/Image";
import ImageCanvasSource from "ol/source/ImageCanvas";
import type ImageSource from "ol/source/Image";
import OlVectorLayer from "ol/layer/Vector";
import OlVectorSource from "ol/source/Vector";
import PointerInteraction from "ol/interaction/Pointer";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { fromExtent } from "ol/geom/Polygon";
import Style from "ol/style/Style";
import Stroke from "ol/style/Stroke";
import Fill from "ol/style/Fill";
import CircleStyle from "ol/style/Circle";
import { updateSourceConfig, type LocalSource } from "../../../infrastructure/tauri";
import { useMapStore } from "../../../store/mapStore";
import { sourceId } from "../../layers/domain/layerBuilder";
import { useDrawLayerStore } from "../../layers/model/drawLayerStore";
import { parseLayerParams } from "../../layers/model/layerTypeConfig";
import type { Extent3857 } from "../../layers/services/imageLayerLoader";
import { computeRotatedExtent, createRotatedImageDataUrl } from "../services/imageTransform";
import { APP_LAYER_ID } from "./layerSyncShared";

type HandleKind = "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const MIN_EXTENT_SIZE = 10;

const boxStyle = new Style({
  stroke: new Stroke({ color: "#1671a8", width: 2.5, lineDash: [6, 4] }),
  fill: new Fill({ color: "rgba(22, 113, 168, 0.08)" }),
});

const handleStyle = new Style({
  image: new CircleStyle({
    radius: 6,
    fill: new Fill({ color: "#ffffff" }),
    stroke: new Stroke({ color: "#1671a8", width: 2 }),
  }),
});

function syncHelperFeatures(source: OlVectorSource<Feature>, ext: Extent3857) {
  const [minX, minY, maxX, maxY] = ext;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const handles: Array<[HandleKind, number, number]> = [
    ["nw", minX, maxY],
    ["n", cx, maxY],
    ["ne", maxX, maxY],
    ["e", maxX, cy],
    ["se", maxX, minY],
    ["s", cx, minY],
    ["sw", minX, minY],
    ["w", minX, cy],
  ];

  const box = new Feature({ geometry: fromExtent(ext), handleKind: "box" });
  box.setStyle(boxStyle);

  const handleFeatures = handles.map(([kind, x, y]) => {
    const f = new Feature({ geometry: new Point([x, y]), handleKind: kind });
    f.setStyle(handleStyle);
    return f;
  });

  source.clear();
  source.addFeatures([box, ...handleFeatures]);
}

function applyDrag(
  start: Extent3857,
  kind: HandleKind,
  dx: number,
  dy: number,
  lockAspectRatio: boolean
): Extent3857 {
  let [minX, minY, maxX, maxY] = start;
  if (kind === "move") {
    return [minX + dx, minY + dy, maxX + dx, maxY + dy];
  }
  if (kind.includes("w")) minX = Math.min(maxX - MIN_EXTENT_SIZE, minX + dx);
  if (kind.includes("e")) maxX = Math.max(minX + MIN_EXTENT_SIZE, maxX + dx);
  if (kind.includes("s")) minY = Math.min(maxY - MIN_EXTENT_SIZE, minY + dy);
  if (kind.includes("n")) maxY = Math.max(minY + MIN_EXTENT_SIZE, maxY + dy);

  if (!lockAspectRatio) {
    return [minX, minY, maxX, maxY];
  }

  const startW = Math.max(MIN_EXTENT_SIZE, start[2] - start[0]);
  const startH = Math.max(MIN_EXTENT_SIZE, start[3] - start[1]);
  const aspect = startW / startH;

  if (kind === "w" || kind === "e") {
    const newW = maxX - minX;
    const newH = Math.max(MIN_EXTENT_SIZE, newW / aspect);
    const cy = (start[1] + start[3]) / 2;
    return [minX, cy - newH / 2, maxX, cy + newH / 2];
  }
  if (kind === "n" || kind === "s") {
    const newH = maxY - minY;
    const newW = Math.max(MIN_EXTENT_SIZE, newH * aspect);
    const cx = (start[0] + start[2]) / 2;
    return [cx - newW / 2, minY, cx + newW / 2, maxY];
  }

  const scaleX = (maxX - minX) / startW;
  const scaleY = (maxY - minY) / startH;
  const scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
  const newW = Math.max(MIN_EXTENT_SIZE, startW * scale);
  const newH = Math.max(MIN_EXTENT_SIZE, newW / aspect);
  const anchoredX = kind.includes("w") ? start[2] - newW : start[0];
  const anchoredY = kind.includes("s") ? start[3] - newH : start[1];
  return [anchoredX, anchoredY, anchoredX + newW, anchoredY + newH];
}

function mapDisplayToRawExtent(
  rawExt: Extent3857,
  oldDisp: Extent3857,
  newDisp: Extent3857,
  rotationDeg: number
): Extent3857 {
  if (rotationDeg === 0) return newDisp;
  const oldW = Math.max(MIN_EXTENT_SIZE, oldDisp[2] - oldDisp[0]);
  const oldH = Math.max(MIN_EXTENT_SIZE, oldDisp[3] - oldDisp[1]);
  const scaleX = (newDisp[2] - newDisp[0]) / oldW;
  const scaleY = (newDisp[3] - newDisp[1]) / oldH;
  const dCx = (newDisp[0] + newDisp[2]) / 2 - (oldDisp[0] + oldDisp[2]) / 2;
  const dCy = (newDisp[1] + newDisp[3]) / 2 - (oldDisp[1] + oldDisp[3]) / 2;
  const rawCx = (rawExt[0] + rawExt[2]) / 2 + dCx;
  const rawCy = (rawExt[1] + rawExt[3]) / 2 + dCy;
  const nextHalfW = Math.max(MIN_EXTENT_SIZE / 2, ((rawExt[2] - rawExt[0]) / 2) * scaleX);
  const nextHalfH = Math.max(MIN_EXTENT_SIZE / 2, ((rawExt[3] - rawExt[1]) / 2) * scaleY);
  return [rawCx - nextHalfW, rawCy - nextHalfH, rawCx + nextHalfW, rawCy + nextHalfH];
}

export function useImageAdjustInteraction(
  mapRef: RefObject<OlMap | null>,
  adjustingImageSourceId: number | null,
  sources: LocalSource[]
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || adjustingImageSourceId === null) return;
    const sourceObj = sources.find((s) => s.id === adjustingImageSourceId);
    if (!sourceObj) return;

    const params = parseLayerParams(sourceObj.params);
    const rawExt = Array.isArray(params.extent) && params.extent.length === 4
      ? (params.extent.map(Number) as Extent3857)
      : useDrawLayerStore.getState().currentViewExtent3857;
    const rotation = typeof params.rotation === "number" && Number.isFinite(params.rotation) ? params.rotation : 0;

    const initialDisp = computeRotatedExtent(rawExt, rotation);
    let currentDisp: Extent3857 = [...initialDisp];
    let startDisp: Extent3857 = [...initialDisp];
    let startCoord: [number, number] | null = null;
    let activeHandle: HandleKind | null = null;

    const helperSource = new OlVectorSource<Feature>();
    syncHelperFeatures(helperSource, currentDisp);
    const helperLayer = new OlVectorLayer({ source: helperSource, zIndex: 95 });

    const targetLayer = map.getLayers().getArray().find(
      (l) => l instanceof ImageLayer && sourceId(String(l.get(APP_LAYER_ID) ?? "")) === sourceObj.id
    ) as ImageLayer<ImageSource> | undefined;
    const originalSource = targetLayer?.getSource() ?? null;

    const rawUrl = typeof params.dataUrl === "string" && params.dataUrl
      ? params.dataUrl
      : sourceObj.url || sourceObj.base_path;
    const previewImg = new Image();
    if (!rawUrl.startsWith("data:")) {
      previewImg.crossOrigin = "anonymous";
    }
    let disposed = false;
    if (rotation !== 0) {
      void createRotatedImageDataUrl(rawUrl, rotation)
        .then((rotatedUrl) => {
          if (!disposed) previewImg.src = rotatedUrl;
        })
        .catch(() => {
          if (!disposed) previewImg.src = rawUrl;
        });
    } else {
      previewImg.src = rawUrl;
    }

    const previewCanvas = document.createElement("canvas");
    const liveSource = new ImageCanvasSource({
      projection: "EPSG:3857",
      canvasFunction(extent, _resolution, _pixelRatio, size) {
        const w = Math.max(1, Math.round(size[0]));
        const h = Math.max(1, Math.round(size[1]));
        if (previewCanvas.width !== w) previewCanvas.width = w;
        if (previewCanvas.height !== h) previewCanvas.height = h;
        const ctx = previewCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, w, h);
          if (previewImg.complete && previewImg.naturalWidth > 0) {
            const extW = extent[2] - extent[0];
            const extH = extent[3] - extent[1];
            if (extW > 0 && extH > 0) {
              const dx = ((currentDisp[0] - extent[0]) / extW) * w;
              const dy = ((extent[3] - currentDisp[3]) / extH) * h;
              const dw = ((currentDisp[2] - currentDisp[0]) / extW) * w;
              const dh = ((currentDisp[3] - currentDisp[1]) / extH) * h;
              ctx.drawImage(previewImg, dx, dy, dw, dh);
            }
          }
        }
        return previewCanvas;
      },
    });

    const pointer = new PointerInteraction({
      handleDownEvent(evt) {
        const hit = map.forEachFeatureAtPixel(
          evt.pixel,
          (f) => f.get("handleKind") as string | undefined,
          { layerFilter: (l) => l === helperLayer, hitTolerance: 8 }
        );
        if (!hit) return false;
        activeHandle = hit === "box" ? "move" : (hit as HandleKind);
        startCoord = [evt.coordinate[0], evt.coordinate[1]];
        startDisp = [...currentDisp];
        if (targetLayer && previewImg.complete && previewImg.naturalWidth > 0) {
          targetLayer.setSource(liveSource);
        }
        return true;
      },
      handleDragEvent(evt) {
        if (!activeHandle || !startCoord) return;
        const dx = evt.coordinate[0] - startCoord[0];
        const dy = evt.coordinate[1] - startCoord[1];
        const lockAspectRatio = useDrawLayerStore.getState().lockAspectRatio;
        currentDisp = applyDrag(startDisp, activeHandle, dx, dy, lockAspectRatio);
        syncHelperFeatures(helperSource, currentDisp);
        if (targetLayer && previewImg.complete && previewImg.naturalWidth > 0) {
          if (targetLayer.getSource() !== liveSource) {
            targetLayer.setSource(liveSource);
          } else {
            liveSource.changed();
          }
        }
      },
      handleUpEvent() {
        if (!activeHandle) return false;
        activeHandle = null;
        startCoord = null;
        const nextRaw = mapDisplayToRawExtent(rawExt, initialDisp, currentDisp, rotation);
        void updateSourceConfig(sourceObj.id, {
          ...sourceObj,
          params: JSON.stringify({ ...params, extent: nextRaw }),
        }).then(() => useMapStore.getState().reloadSources());
        return false;
      },
    });

    map.addLayer(helperLayer);
    map.addInteraction(pointer);

    return () => {
      disposed = true;
      if (targetLayer && originalSource && targetLayer.getSource() === liveSource) {
        targetLayer.setSource(originalSource);
      }
      map.removeInteraction(pointer);
      map.removeLayer(helperLayer);
    };
  }, [mapRef, adjustingImageSourceId, sources]);
}
