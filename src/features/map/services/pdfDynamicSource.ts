import ImageCanvasSource from "ol/source/ImageCanvas";
import { loadRemotePdfBytes, type Extent3857 } from "../../layers/services/imageLayerLoader";
import { computeRotatedExtent } from "./imageTransform";
import type { PdfRenderRequest, PdfRenderResponse } from "./pdfRenderWorker";

interface HiResTile {
  bitmap: ImageBitmap;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  drawW: number;
}

const MAX_RENDER_SCALE = 24;
const MAX_TILE_SIDE = 3200;
const RENDER_DEBOUNCE_MS = 350;

let sharedPdfWorker: Worker | null = null;
const sentUrlsToWorker = new Set<string>();

function getPdfWorker(): Worker | null {
  if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  if (!sharedPdfWorker) {
    sharedPdfWorker = new Worker(new URL("./pdfRenderWorker.ts", import.meta.url), { type: "module" });
  }
  return sharedPdfWorker;
}

function viewBoundsInPdfUv(
  viewExtent: Extent3857,
  cx: number,
  cy: number,
  rawW: number,
  rawH: number,
  rad: number
): [number, number, number, number] | null {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners: [number, number][] = [
    [viewExtent[0], viewExtent[1]],
    [viewExtent[2], viewExtent[1]],
    [viewExtent[2], viewExtent[3]],
    [viewExtent[0], viewExtent[3]],
  ];
  let uMin = Infinity;
  let vMin = Infinity;
  let uMax = -Infinity;
  let vMax = -Infinity;
  for (const [mx, my] of corners) {
    const dx = mx - cx;
    const dy = cy - my;
    const ux = dx * cos + dy * sin;
    const uy = -dx * sin + dy * cos;
    const u = ux / rawW + 0.5;
    const v = uy / rawH + 0.5;
    if (u < uMin) uMin = u;
    if (v < vMin) vMin = v;
    if (u > uMax) uMax = u;
    if (v > vMax) vMax = v;
  }
  uMin = Math.max(0, uMin);
  vMin = Math.max(0, vMin);
  uMax = Math.min(1, uMax);
  vMax = Math.min(1, vMax);
  if (uMin >= uMax || vMin >= vMax) return null;
  return [uMin, vMin, uMax, vMax];
}

export function createDynamicPdfSource(
  url: string,
  pageNumber: number,
  rawExtent: Extent3857,
  rotationDeg: number,
  fallbackDataUrl?: string
): ImageCanvasSource {
  const rotatedExtent = computeRotatedExtent(rawExtent, rotationDeg);
  const rad = (rotationDeg * Math.PI) / 180;
  const rawW = Math.max(1, rawExtent[2] - rawExtent[0]);
  const rawH = Math.max(1, rawExtent[3] - rawExtent[1]);
  const cx = (rawExtent[0] + rawExtent[2]) / 2;
  const cy = (rawExtent[1] + rawExtent[3]) / 2;

  const fallbackImg = fallbackDataUrl ? new Image() : null;
  if (fallbackImg && fallbackDataUrl) {
    fallbackImg.src = fallbackDataUrl;
  }

  let hiResTile: HiResTile | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let renderSeq = 0;
  const canvasPool = [document.createElement("canvas"), document.createElement("canvas")];
  let canvasIdx = 0;

  const clearHiResTile = () => {
    if (hiResTile) {
      hiResTile.bitmap.close();
      hiResTile = null;
    }
  };

  const scheduleHiResRender = (
    source: ImageCanvasSource,
    uv: [number, number, number, number],
    drawW: number
  ) => {
    const worker = getPdfWorker();
    if (!worker) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const seq = ++renderSeq;
      const padU = (uv[2] - uv[0]) * 0.1;
      const padV = (uv[3] - uv[1]) * 0.1;
      const u0 = Math.max(0, uv[0] - padU);
      const v0 = Math.max(0, uv[1] - padV);
      const u1 = Math.min(1, uv[2] + padU);
      const v1 = Math.min(1, uv[3] + padV);

      const fallbackW = fallbackImg && fallbackImg.naturalWidth > 0 ? fallbackImg.naturalWidth : 2000;
      const desiredScale = MAX_RENDER_SCALE;

      const dispatch = (pdfBuffer?: ArrayBuffer) => {
        const handleMessage = (ev: MessageEvent<PdfRenderResponse>) => {
          const msg = ev.data;
          if (msg.seq !== seq) return;
          worker.removeEventListener("message", handleMessage);
          if (seq !== renderSeq) {
            msg.bitmap?.close();
            return;
          }
          if (msg.type === "clear") {
            clearHiResTile();
            source.changed();
          } else if (msg.type === "rendered" && msg.bitmap) {
            clearHiResTile();
            hiResTile = {
              bitmap: msg.bitmap,
              u0: msg.u0 ?? u0,
              v0: msg.v0 ?? v0,
              u1: msg.u1 ?? u1,
              v1: msg.v1 ?? v1,
              drawW: msg.drawW ?? drawW,
            };
            source.changed();
          }
        };
        worker.addEventListener("message", handleMessage);
        const req: PdfRenderRequest = {
          type: "render",
          seq,
          url,
          pdfBuffer,
          pageNumber,
          u0,
          v0,
          u1,
          v1,
          desiredScale,
          fallbackW,
          drawW,
          maxTileSide: MAX_TILE_SIDE,
        };
        if (pdfBuffer) {
          worker.postMessage(req, [pdfBuffer]);
        } else {
          worker.postMessage(req);
        }
      };

      if (sentUrlsToWorker.has(url)) {
        dispatch();
      } else {
        void loadRemotePdfBytes(url)
          .then((bytes) => {
            if (seq !== renderSeq) return;
            sentUrlsToWorker.add(url);
            dispatch(bytes.slice().buffer);
          })
          .catch(() => {
            // Ignore network error; fallback image remains visible
          });
      }
    }, RENDER_DEBOUNCE_MS);
  };

  const source = new ImageCanvasSource({
    projection: "EPSG:3857",
    canvasFunction(viewExtent, _resolution, _pixelRatio, size) {
      const w = Math.max(1, Math.round(size[0]));
      const h = Math.max(1, Math.round(size[1]));
      canvasIdx = (canvasIdx + 1) % 2;
      const outCanvas = canvasPool[canvasIdx];
      if (outCanvas.width !== w) outCanvas.width = w;
      if (outCanvas.height !== h) outCanvas.height = h;
      const ctx = outCanvas.getContext("2d");
      if (!ctx) return outCanvas;
      ctx.clearRect(0, 0, w, h);

      const extW = viewExtent[2] - viewExtent[0];
      const extH = viewExtent[3] - viewExtent[1];
      if (extW <= 0 || extH <= 0) return outCanvas;
      if (
        viewExtent[2] < rotatedExtent[0] ||
        viewExtent[0] > rotatedExtent[2] ||
        viewExtent[3] < rotatedExtent[1] ||
        viewExtent[1] > rotatedExtent[3]
      ) {
        return outCanvas;
      }

      const pxPerMapX = w / extW;
      const pxPerMapY = h / extH;
      const drawW = rawW * pxPerMapX;
      const drawH = rawH * pxPerMapY;

      ctx.save();
      ctx.translate((cx - viewExtent[0]) * pxPerMapX, (viewExtent[3] - cy) * pxPerMapY);
      if (rad !== 0) ctx.rotate(rad);
      if (fallbackImg && fallbackImg.complete && fallbackImg.naturalWidth > 0) {
        ctx.drawImage(fallbackImg, -drawW / 2, -drawH / 2, drawW, drawH);
      }
      if (hiResTile) {
        const tx = (hiResTile.u0 - 0.5) * drawW;
        const ty = (hiResTile.v0 - 0.5) * drawH;
        const tw = (hiResTile.u1 - hiResTile.u0) * drawW;
        const th = (hiResTile.v1 - hiResTile.v0) * drawH;
        ctx.drawImage(hiResTile.bitmap, tx, ty, tw, th);
      }
      ctx.restore();

      const uv = viewBoundsInPdfUv(viewExtent as Extent3857, cx, cy, rawW, rawH, rad);
      const fallbackW = fallbackImg && fallbackImg.naturalWidth > 0 ? fallbackImg.naturalWidth : 2000;
      const needsHiRes = drawW > fallbackW * 1.05;
      if (uv && needsHiRes) {
        const covers =
          hiResTile &&
          hiResTile.u0 <= uv[0] + 0.001 &&
          hiResTile.v0 <= uv[1] + 0.001 &&
          hiResTile.u1 >= uv[2] - 0.001 &&
          hiResTile.v1 >= uv[3] - 0.001;
        const scaleChanged =
          !hiResTile ||
          Math.abs(drawW - hiResTile.drawW) / Math.max(1, hiResTile.drawW) > 0.25;
        if (!covers || scaleChanged) {
          scheduleHiResRender(source, uv, drawW);
        }
      } else if (!needsHiRes && hiResTile) {
        clearHiResTile();
      }

      return outCanvas;
    },
  });

  if (fallbackImg && !fallbackImg.complete) {
    fallbackImg.onload = () => source.changed();
  }

  return source;
}
