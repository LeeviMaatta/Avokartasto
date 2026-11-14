import { fromLonLat, toLonLat } from "ol/proj";
import { useDrawLayerStore } from "../model/drawLayerStore";
import { parseLayerParams } from "../model/layerTypeConfig";
import { computeAspectExtent, type Extent3857 } from "../services/imageLayerLoader";

interface ImageExtentFieldsProps {
  params: string;
  opacity: number;
  onParamsChange: (next: string) => void;
  onOpacityChange: (next: number) => void;
}

function readExtent3857(parsed: Record<string, unknown>, fallback: Extent3857): Extent3857 {
  if (Array.isArray(parsed.extent) && parsed.extent.length === 4) {
    const nums = parsed.extent.map(Number);
    if (nums.every(Number.isFinite)) return nums as Extent3857;
  }
  return fallback;
}

export function ImageExtentFields({
  params,
  opacity,
  onParamsChange,
  onOpacityChange,
}: ImageExtentFieldsProps) {
  const currentViewExtent3857 = useDrawLayerStore((s) => s.currentViewExtent3857);
  const parsed = parseLayerParams(params);
  const extent3857 = readExtent3857(parsed, currentViewExtent3857);

  const [minLon, minLat] = toLonLat([extent3857[0], extent3857[1]]);
  const [maxLon, maxLat] = toLonLat([extent3857[2], extent3857[3]]);

  const updateLonLat = (idx: 0 | 1 | 2 | 3, val: number) => {
    if (!Number.isFinite(val)) return;
    const coords = [minLon, minLat, maxLon, maxLat];
    coords[idx] = val;
    const sw = fromLonLat([coords[0], coords[1]]);
    const ne = fromLonLat([coords[2], coords[3]]);
    onParamsChange(JSON.stringify({ ...parsed, extent: [sw[0], sw[1], ne[0], ne[1]] }));
  };

  const resetToCurrentView = () => {
    const w = typeof parsed.imageWidth === "number" ? parsed.imageWidth : 1000;
    const h = typeof parsed.imageHeight === "number" ? parsed.imageHeight : 1000;
    const nextExtent = computeAspectExtent(currentViewExtent3857, w, h);
    onParamsChange(JSON.stringify({ ...parsed, extent: nextExtent }));
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-2.5 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-600 dark:text-zinc-300">Kuvan sijainti kartalla (WGS84)</span>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          onClick={resetToCurrentView}
        >
          Käytä nykyistä näkymää
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label>
          Länsi (minLon)
          <input type="number" step="0.0001" className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900" value={Number(minLon.toFixed(5))} onChange={(e) => updateLonLat(0, Number(e.target.value))} />
        </label>
        <label>
          Etelä (minLat)
          <input type="number" step="0.0001" className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900" value={Number(minLat.toFixed(5))} onChange={(e) => updateLonLat(1, Number(e.target.value))} />
        </label>
        <label>
          Itä (maxLon)
          <input type="number" step="0.0001" className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900" value={Number(maxLon.toFixed(5))} onChange={(e) => updateLonLat(2, Number(e.target.value))} />
        </label>
        <label>
          Pohjoinen (maxLat)
          <input type="number" step="0.0001" className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900" value={Number(maxLat.toFixed(5))} onChange={(e) => updateLonLat(3, Number(e.target.value))} />
        </label>
      </div>
      <label className="block text-xs">
        Läpinäkyvyys: {Math.round(opacity * 100)}%
        <input type="range" min="0" max="1" step="0.05" className="mt-1 w-full accent-[#1671a8]" value={opacity} onChange={(e) => onOpacityChange(Number(e.target.value))} />
      </label>
    </div>
  );
}
