import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { fetchRemoteAssetBytes } from "../../../infrastructure/tauri/layerSourceBridge";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export type Extent3857 = [number, number, number, number];

export interface LoadedImageLayerAsset {
  dataUrl: string;
  width: number;
  height: number;
  extent: Extent3857;
  pageNumber?: number;
  pageCount?: number;
}

const pdfBytesCache = new Map<string, Uint8Array>();

export function computeAspectExtent(
  viewExtent3857: Extent3857,
  width: number,
  height: number,
): Extent3857 {
  const [minX, minY, maxX, maxY] = viewExtent3857;
  const viewW = Math.max(100, maxX - minX);
  const viewH = Math.max(100, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const safeW = width > 0 ? width : 1000;
  const safeH = height > 0 ? height : 1000;
  const aspect = safeW / safeH;

  const targetMaxW = viewW * 0.6;
  const targetMaxH = viewH * 0.6;
  let w = targetMaxW;
  let h = w / aspect;
  if (h > targetMaxH) {
    h = targetMaxH;
    w = h * aspect;
  }

  return [
    Math.round(cx - w / 2),
    Math.round(cy - h / 2),
    Math.round(cx + w / 2),
    Math.round(cy + h / 2),
  ];
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Tiedoston lukeminen epäonnistui."));
    reader.readAsDataURL(blob);
  });
}

function measureImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1000, height: img.naturalHeight || 1000 });
    img.onerror = () => reject(new Error("Kuvaa ei voitu purkaa."));
    img.src = dataUrl;
  });
}

function isPdfBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

async function renderPdfBytesToAsset(
  bytes: Uint8Array,
  viewExtent3857: Extent3857,
  requestedPage = 1,
): Promise<LoadedImageLayerAsset> {
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const pageNumber = Math.max(1, Math.min(pageCount, Math.round(requestedPage) || 1));
  const page = await pdf.getPage(pageNumber);
  const baseVp = page.getViewport({ scale: 1 });
  const maxDim = Math.max(baseVp.width, baseVp.height, 1);
  const scale = Math.min(4.5, Math.max(2, 4096 / maxDim));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas-kontekstia ei voitu luoda PDF-renderöintiä varten.");

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  const dataUrl = canvas.toDataURL("image/png");
  return {
    dataUrl,
    width: canvas.width,
    height: canvas.height,
    extent: computeAspectExtent(viewExtent3857, canvas.width, canvas.height),
    pageNumber,
    pageCount,
  };
}

export async function loadImageFileForLayer(
  file: File,
  viewExtent3857: Extent3857,
  pageNumber = 1,
): Promise<LoadedImageLayerAsset> {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return renderPdfBytesToAsset(bytes, viewExtent3857, pageNumber);
  }
  const dataUrl = await readAsDataUrl(file);
  const { width, height } = await measureImage(dataUrl);
  return {
    dataUrl,
    width,
    height,
    extent: computeAspectExtent(viewExtent3857, width, height),
  };
}

export async function loadImageUrlForLayer(
  url: string,
  viewExtent3857: Extent3857,
  pageNumber = 1,
): Promise<LoadedImageLayerAsset> {
  let bytes = pdfBytesCache.get(url);
  if (!bytes) {
    bytes = await fetchRemoteAssetBytes(url);
    if (isPdfBytes(bytes)) {
      if (pdfBytesCache.size >= 3) {
        const oldest = pdfBytesCache.keys().next().value;
        if (oldest) pdfBytesCache.delete(oldest);
      }
      pdfBytesCache.set(url, bytes);
    }
  }
  if (isPdfBytes(bytes) || url.toLowerCase().split("?")[0].endsWith(".pdf")) {
    return renderPdfBytesToAsset(bytes, viewExtent3857, pageNumber);
  }
  const dataUrl = await readAsDataUrl(new Blob([bytes.buffer as ArrayBuffer]));
  const { width, height } = await measureImage(dataUrl);
  return {
    dataUrl,
    width,
    height,
    extent: computeAspectExtent(viewExtent3857, width, height),
  };
}

export async function loadRemotePdfBytes(url: string): Promise<Uint8Array> {
  let bytes = pdfBytesCache.get(url);
  if (!bytes) {
    bytes = await fetchRemoteAssetBytes(url);
    if (isPdfBytes(bytes)) {
      if (pdfBytesCache.size >= 3) {
        const oldest = pdfBytesCache.keys().next().value;
        if (oldest) pdfBytesCache.delete(oldest);
      }
      pdfBytesCache.set(url, bytes);
    }
  }
  return bytes;
}

export async function loadRemotePdfDocument(url: string): Promise<pdfjsLib.PDFDocumentProxy> {
  const bytes = await loadRemotePdfBytes(url);
  return pdfjsLib.getDocument({ data: bytes.slice() }).promise;
}

export async function loadVectorFileText(file: File): Promise<string> {
  return file.text();
}
