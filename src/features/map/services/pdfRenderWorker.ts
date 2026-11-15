import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfRenderRequest {
  type: "render";
  seq: number;
  url: string;
  pdfBuffer?: ArrayBuffer;
  pageNumber: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  desiredScale: number;
  fallbackW: number;
  drawW: number;
  maxTileSide: number;
}

export interface PdfRenderResponse {
  type: "rendered" | "clear" | "error";
  seq: number;
  bitmap?: ImageBitmap;
  u0?: number;
  v0?: number;
  u1?: number;
  v1?: number;
  drawW?: number;
}

const docCache = new Map<string, Promise<PDFDocumentProxy>>();
let latestSeq = 0;
let activeTask: RenderTask | null = null;

function getDocumentForUrl(url: string, pdfBuffer?: ArrayBuffer): Promise<PDFDocumentProxy> {
  let promise = docCache.get(url);
  if (!promise && pdfBuffer) {
    promise = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
    if (docCache.size >= 3) {
      const oldest = docCache.keys().next().value;
      if (oldest) docCache.delete(oldest);
    }
    docCache.set(url, promise);
  }
  if (!promise) {
    return Promise.reject(new Error("Missing PDF bytes"));
  }
  return promise;
}

self.onmessage = async (event: MessageEvent<PdfRenderRequest>) => {
  const req = event.data;
  if (req.type !== "render") return;
  latestSeq = req.seq;

  if (activeTask) {
    activeTask.cancel();
    activeTask = null;
  }

  try {
    const pdf = await getDocumentForUrl(req.url, req.pdfBuffer);
    if (req.seq !== latestSeq) return;

    const safePage = Math.max(1, Math.min(pdf.numPages, Math.round(req.pageNumber) || 1));
    const page = await pdf.getPage(safePage);
    if (req.seq !== latestSeq) return;

    const baseVp = page.getViewport({ scale: 1 });
    const fallbackScale = req.fallbackW / Math.max(1, baseVp.width);
    const actualDesired = Math.min(
      req.desiredScale,
      req.drawW / Math.max(1, baseVp.width)
    );
    if (actualDesired <= fallbackScale * 1.05) {
      self.postMessage({ type: "clear", seq: req.seq } satisfies PdfRenderResponse);
      return;
    }

    const rawCropW = (req.u1 - req.u0) * baseVp.width * actualDesired;
    const rawCropH = (req.v1 - req.v0) * baseVp.height * actualDesired;
    const capFactor = Math.min(1, req.maxTileSide / Math.max(1, rawCropW, rawCropH));
    const renderScale = actualDesired * capFactor;

    const tileW = Math.max(1, Math.round((req.u1 - req.u0) * baseVp.width * renderScale));
    const tileH = Math.max(1, Math.round((req.v1 - req.v0) * baseVp.height * renderScale));
    const offscreen = new OffscreenCanvas(tileW, tileH);
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;

    const viewport = page.getViewport({
      scale: renderScale,
      offsetX: -req.u0 * baseVp.width * renderScale,
      offsetY: -req.v0 * baseVp.height * renderScale,
    });

    const task = page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: offscreen as unknown as HTMLCanvasElement,
    });
    activeTask = task;
    await task.promise;
    if (activeTask === task) activeTask = null;
    if (req.seq !== latestSeq) return;

    const bitmap = offscreen.transferToImageBitmap();
    const response: PdfRenderResponse = {
      type: "rendered",
      seq: req.seq,
      bitmap,
      u0: req.u0,
      v0: req.v0,
      u1: req.u1,
      v1: req.v1,
      drawW: req.drawW,
    };
    (self as unknown as Worker).postMessage(response, [bitmap]);
  } catch (err) {
    if (err instanceof Error && err.name !== "RenderingCancelledException") {
      console.error("[pdfRenderWorker]", err);
    }
    if (req.seq === latestSeq) {
      self.postMessage({ type: "error", seq: req.seq } satisfies PdfRenderResponse);
    }
  }
};
