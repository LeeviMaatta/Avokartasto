import { Check, Edit3, MapPin, Minus, Pentagon, PenTool, Undo2 } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { useDrawLayerStore, type DrawLayerTool } from "../model/drawLayerStore";

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
  const sources = useMapStore((s) => s.sources);
  const rawOverlayOpacity = Number(useMapStore((s) => s.settings.uiOverlayOpacity ?? "1"));
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;

  if (adjustingImageSourceId !== null) {
    const imgSource = sources.find((s) => s.id === adjustingImageSourceId);
    return (
      <div
        className="absolute left-2 right-2 top-16 sm:top-20 z-20 flex flex-wrap items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-800 shadow-lg backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-white sm:left-1/2 sm:right-auto sm:w-max sm:max-w-[min(96vw,68rem)] sm:-translate-x-1/2"
        style={{ opacity: overlayOpacity }}
      >
        <span className="font-semibold text-[#1671a8] dark:text-sky-400">
          {imgSource?.name || "Kuva"}:
        </span>
        <span>Siirrä tai venytä kuvan kehystä kartalla</span>
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
