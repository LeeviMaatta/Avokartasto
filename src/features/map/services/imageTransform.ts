import type { Extent3857 } from "../../layers/services/imageLayerLoader";

export function computeRotatedExtent(extent: Extent3857, rotationDeg: number): Extent3857 {
  const deg = ((rotationDeg % 360) + 360) % 360;
  if (deg === 0) return extent;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const [minX, minY, maxX, maxY] = extent;
  const w = maxX - minX;
  const h = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rw = w * cos + h * sin;
  const rh = w * sin + h * cos;
  return [cx - rw / 2, cy - rh / 2, cx + rw / 2, cy + rh / 2];
}

export function scaleExtent(extent: Extent3857, factor: number): Extent3857 {
  const [minX, minY, maxX, maxY] = extent;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const hw = ((maxX - minX) / 2) * factor;
  const hh = ((maxY - minY) / 2) * factor;
  return [Math.round(cx - hw), Math.round(cy - hh), Math.round(cx + hw), Math.round(cy + hh)];
}

export function createRotatedImageDataUrl(src: string, rotationDeg: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const nw = img.naturalWidth || 1000;
      const nh = img.naturalHeight || 1000;
      const rad = (rotationDeg * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const cw = Math.max(1, Math.round(nw * cos + nh * sin));
      const ch = Math.max(1, Math.round(nw * sin + nh * cos));
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(src);
        return;
      }
      ctx.translate(cw / 2, ch / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -nw / 2, -nh / 2, nw, nh);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Kuvan kierto epäonnistui."));
    img.src = src;
  });
}
