import { useEffect, useRef, useState } from "react";
import { Check, Edit3, Lock, MapPin, Minus, Pentagon, PenTool, RotateCcw, RotateCw, Undo2, Unlock, ZoomIn, ZoomOut } from "lucide-react";
import { updateSourceConfig } from "../../../infrastructure/tauri";
import { useMapStore } from "../../../store/mapStore";
import { useDrawLayerStore, type DrawLayerTool } from "../model/drawLayerStore";
import { parseLayerParams } from "../model/layerTypeConfig";
import type { Extent3857 } from "../services/imageLayerLoader";
import { scaleExtent } from "../../map/services/imageTransform";

const TOOLS: { id: DrawLayerTool; label: string; icon: typeof PenTool }[] = [
  { id: "freehand", label: "Vapaakäsi", icon: PenTool },
  { id: "LineString", label: "Viiva", icon: Minus },
  { id: "Polygon", label: "Alue", icon: Pentagon },
  { id: "Point", label: "Piste", icon: MapPin },
  { id: "modify", label: "Muokkaa", icon: Edit3 },
];

export function DrawLayerToolbar() {
  const activeDrawSourceId = useDrawLayerStore((s) => s.activeDrawSourceId);
  const drawTool = useDrawLayerStore((s) => s.drawTool);
  const strokeColor = useDrawLayerStore((s) => s.strokeColor);
  const strokeWidth = useDrawLayerStore((s) => s.strokeWidth);
  const adjustingImageSourceId = useDrawLayerStore((s) => s.adjustingImageSourceId);
  const lockAspectRatio = useDrawLayerStore((s) => s.lockAspectRatio);
  const sources = useMapStore((s) => s.sources);
  const rawOverlayOpacity = Number(useMapStore((s) => s.settings.uiOverlayOpacity ?? "1"));
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;

  const imgSource = adjustingImageSourceId !== null
    ? sources.find((s) => s.id === adjustingImageSourceId)
    : undefined;
  const imgParams = parseLayerParams(imgSource?.params);
  const storedRotation = typeof imgParams.rotation === "number" && Number.isFinite(imgParams.rotation)
    ? imgParams.rotation
    : 0;
  const [rotationInput, setRotationInput] = useState(String(storedRotation));
  const [shiftHeld, setShiftHeld] = useState(false);
  const sliderOriginRef = useRef<{ sliderVal: number; rot: number } | null>(null);

  useEffect(() => {
    setRotationInput(String(storedRotation));
  }, [storedRotation, adjustingImageSourceId]);

  useEffect(() => {
    if (adjustingImageSourceId === null) return;
    const onKey = (e: KeyboardEvent) => setShiftHeld(e.shiftKey);
    const onBlur = () => setShiftHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, [adjustingImageSourceId]);

  if (adjustingImageSourceId !== null) {
    const params = imgParams;
    const currentExt = Array.isArray(params.extent) && params.extent.length === 4
      ? (params.extent.map(Number) as Extent3857)
      : useDrawLayerStore.getState().currentViewExtent3857;
    const rotation = storedRotation;

    const persistParams = (nextParams: Record<string, unknown>) => {
      if (!imgSource) return;
      void updateSourceConfig(imgSource.id, {
        ...imgSource,
        params: JSON.stringify(nextParams),
      }).then(() => useMapStore.getState().reloadSources());
    };

    const handleScale = (factor: number) => {
      persistParams({ ...params, extent: scaleExtent(currentExt, factor) });
    };

    const handleRotate = (nextDeg: number) => {
      if (!Number.isFinite(nextDeg)) return;
      const wrapped = nextDeg >= -180 && nextDeg <= 180
        ? nextDeg
        : ((((nextDeg + 540) % 360) + 360) % 360) - 180;
      const rounded = Math.round(wrapped * 100) / 100;
      setRotationInput(String(rounded));
      persistParams({ ...params, rotation: rounded });
    };

    const commitRotationInput = () => {
      const trimmed = rotationInput.trim().replace(",", ".");
      const parsedVal = Number(trimmed);
      if (trimmed === "" || !Number.isFinite(parsedVal)) {
        setRotationInput(String(rotation));
        return;
      }
      handleRotate(parsedVal);
    };

    return (
      <div
        className="absolute left-2 right-2 top-16 sm:top-20 z-20 flex flex-wrap items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-800 shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-white sm:left-1/2 sm:right-auto sm:w-max sm:max-w-[min(96vw,68rem)] sm:-translate-x-1/2"
        style={{ opacity: overlayOpacity }}
      >
        <span className="font-semibold text-[#1671a8] dark:text-sky-400">
          {imgSource?.name || "Kuva"}
        </span>
        <div className="flex items-center gap-1 border-l border-slate-200 pl-2.5 dark:border-zinc-700">
          <button
            type="button"
            title="Pienennä (0.9x)"
            className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() => handleScale(0.9)}
          >
            <ZoomOut size={14} />
          </button>
          <button
            type="button"
            title="Suurenna (1.1x)"
            className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() => handleScale(1.1)}
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            title={lockAspectRatio ? "Kuvasuhde lukittu (klikkaa avataksesi)" : "Lukitse kuvasuhde"}
            className={`flex items-center gap-1 rounded border px-2 py-1 ${
              lockAspectRatio
                ? "border-[#1671a8] bg-[#1671a8] text-white"
                : "border-slate-300 hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            }`}
            onClick={() => useDrawLayerStore.getState().setLockAspectRatio(!lockAspectRatio)}
          >
            {lockAspectRatio ? <Lock size={14} /> : <Unlock size={14} />}
            <span className="hidden sm:inline">Kuvasuhde</span>
          </button>
        </div>
        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2.5 dark:border-zinc-700">
          <button
            type="button"
            title="Kierrä -90°"
            className="rounded border border-slate-300 p-1 hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() => handleRotate(rotation - 90)}
          >
            <RotateCcw size={14} />
          </button>
          <input
            type="range"
            min={-180}
            max={180}
            step={shiftHeld ? 0.05 : 0.1}
            title="Pidä SHIFT pohjassa tarkempaa kiertoa varten"
            className="w-24 accent-[#1671a8]"
            value={rotation}
            onPointerDown={(e) => {
              sliderOriginRef.current = { sliderVal: Number(e.currentTarget.value), rot: rotation };
            }}
            onPointerUp={() => { sliderOriginRef.current = null; }}
            onPointerCancel={() => { sliderOriginRef.current = null; }}
            onChange={(e) => {
              const rawVal = Number(e.target.value);
              if (shiftHeld && sliderOriginRef.current) {
                const delta = rawVal - sliderOriginRef.current.sliderVal;
                handleRotate(sliderOriginRef.current.rot + delta * 0.1);
              } else {
                sliderOriginRef.current = { sliderVal: rawVal, rot: rawVal };
                handleRotate(rawVal);
              }
            }}
          />
          <div className="flex items-center gap-0.5">
            <input
              type="text"
              inputMode="decimal"
              aria-label="Kierto asteina"
              className="w-14 rounded border border-slate-300 bg-transparent px-1 py-0.5 text-center text-xs tabular-nums dark:border-zinc-700"
              value={rotationInput}
              onChange={(e) => setRotationInput(e.target.value)}
              onBlur={commitRotationInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  setRotationInput(String(rotation));
                  e.currentTarget.blur();
                }
              }}
            />
            <span>°</span>
          </div>
          <button
            type="button"
            title="Kierrä +90°"
            className="rounded border border-slate-300 p-1 hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            onClick={() => handleRotate(rotation + 90)}
          >
            <RotateCw size={14} />
          </button>
          {rotation !== 0 && (
            <button
              type="button"
              className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              onClick={() => handleRotate(0)}
            >
              0°
            </button>
          )}
        </div>
        <button
          type="button"
          className="flex items-center gap-1 rounded-md bg-[#1671a8] px-2.5 py-1 font-medium text-white hover:bg-[#125d8c]"
          onClick={() => useDrawLayerStore.getState().setAdjustingImageSourceId(null)}
        >
          <Check size={14} />
          Valmis
        </button>
      </div>
    );
  }

  if (activeDrawSourceId === null) return null;

  const drawSource = sources.find((s) => s.id === activeDrawSourceId);

  return (
    <div
      className="absolute left-2 right-2 top-16 sm:top-20 z-20 flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs text-slate-800 shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-white sm:left-1/2 sm:right-auto sm:w-max sm:max-w-[min(96vw,68rem)] sm:-translate-x-1/2"
      style={{ opacity: overlayOpacity }}
    >
      <span className="mr-1 max-w-28 truncate font-semibold text-[#1671a8] dark:text-sky-400">
        {drawSource?.name || "Piirros"}
      </span>

      {TOOLS.map((item) => {
        const Icon = item.icon;
        const active = drawTool === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => useDrawLayerStore.getState().setDrawTool(item.id)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
              active
                ? "bg-[#1671a8] text-white"
                : "hover:bg-slate-100 dark:hover:bg-zinc-800"
            }`}
            title={item.label}
          >
            <Icon size={13} />
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        );
      })}

      <div className="mx-0.5 h-4 w-px bg-slate-200 dark:bg-zinc-700" />

      <input
        type="color"
        title="Piirtoväri"
        className="h-6 w-7 cursor-pointer rounded border border-slate-300 bg-transparent p-0.5 dark:border-zinc-700"
        value={strokeColor}
        onChange={(e) => useDrawLayerStore.getState().setStrokeColor(e.target.value)}
      />

      <select
        title="Viivan leveys"
        className="rounded border border-slate-300 bg-white px-1.5 py-0.5 dark:border-zinc-700 dark:bg-zinc-900"
        value={strokeWidth}
        onChange={(e) => useDrawLayerStore.getState().setStrokeWidth(Number(e.target.value))}
      >
        {[1, 2, 3, 5, 8, 12].map((w) => (
          <option key={w} value={w}>{w}px</option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => useDrawLayerStore.getState().requestUndo()}
        className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-slate-100 dark:hover:bg-zinc-800"
        title="Kumoa viimeisin"
      >
        <Undo2 size={13} />
      </button>

      <button
        type="button"
        onClick={() => useDrawLayerStore.getState().stopDrawingLayer()}
        className="flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 font-medium text-white hover:bg-emerald-700"
      >
        <Check size={13} />
        Valmis
      </button>
    </div>
  );
}
