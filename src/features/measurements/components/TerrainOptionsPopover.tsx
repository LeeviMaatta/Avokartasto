import { Loader2, Mountain, SlidersHorizontal, Undo2 } from "lucide-react";
import type { TerrainRoutePreset } from "../domain/terrainRouting";

interface TerrainOptionsPopoverProps {
  terrainRouting: boolean;
  terrainStage: string;
  terrainOptionsOpen: boolean;
  onToggleOptions: () => void;
  avoidSwamp: boolean;
  onChangeAvoidSwamp: (val: boolean) => void;
  avoidWater: boolean;
  onChangeAvoidWater: (val: boolean) => void;
  avoidStreams: boolean;
  onChangeAvoidStreams: (val: boolean) => void;
  terrainPreset: TerrainRoutePreset;
  onChangePreset: (preset: TerrainRoutePreset) => void;
  hasOriginalGeojson: boolean;
  onRunTerrainRoute: () => void;
  onRestoreOriginal: () => void;
}

export function TerrainOptionsPopover({
  terrainRouting,
  terrainStage,
  terrainOptionsOpen,
  onToggleOptions,
  avoidSwamp,
  onChangeAvoidSwamp,
  avoidWater,
  onChangeAvoidWater,
  avoidStreams,
  onChangeAvoidStreams,
  terrainPreset,
  onChangePreset,
  hasOriginalGeojson,
  onRunTerrainRoute,
  onRestoreOriginal,
}: TerrainOptionsPopoverProps) {
  return (
    <>
      <div className="relative flex items-center">
        <button
          type="button"
          disabled={terrainRouting}
          className="flex items-center gap-1 rounded-l-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-emerald-700 disabled:opacity-60 transition"
          onClick={onRunTerrainRoute}
          title="Muuta etäisyysmittaus maastoreitiksi (vähiten nousua)"
        >
          {terrainRouting ? <Loader2 size={13} className="animate-spin" /> : <Mountain size={13} />}
          <span>{terrainRouting ? (terrainStage || "Haetaan...") : "Maastoreitti"}</span>
        </button>
        <button
          type="button"
          disabled={terrainRouting}
          aria-expanded={terrainOptionsOpen}
          aria-label="Maastoreitin asetukset"
          title="Maastoreitin lisävalinnat"
          className="rounded-r-lg border-l border-emerald-700 bg-emerald-600 px-1.5 py-1 text-white shadow hover:bg-emerald-700 disabled:opacity-60 transition"
          onClick={onToggleOptions}
        >
          <SlidersHorizontal size={13} />
        </button>
        {terrainOptionsOpen && (
          <div className="absolute right-0 top-full z-30 mt-2 w-60 space-y-2 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100">
            <div className="font-semibold text-slate-900 dark:text-white">Maastoreitin asetukset</div>
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <span>Kierrä suoalueet</span>
              <input
                type="checkbox"
                checked={avoidSwamp}
                onChange={(e) => onChangeAvoidSwamp(e.target.checked)}
                className="accent-emerald-600"
              />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-2">
              <span>Kierrä vesistöt</span>
              <input
                type="checkbox"
                checked={avoidWater}
                onChange={(e) => onChangeAvoidWater(e.target.checked)}
                className="accent-emerald-600"
              />
            </label>
            <label className={`flex items-center justify-between gap-2 pl-3 text-[11px] ${avoidWater ? "cursor-pointer text-slate-600 dark:text-zinc-300" : "cursor-not-allowed text-slate-400 opacity-60 dark:text-zinc-500"}`}>
              <span>Kierrä purot ja ojat</span>
              <input
                type="checkbox"
                checked={avoidStreams}
                disabled={!avoidWater}
                onChange={(e) => onChangeAvoidStreams(e.target.checked)}
                className="accent-emerald-600"
              />
            </label>
            <div className="space-y-1 border-t border-slate-100 pt-2 dark:border-zinc-800">
              <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Optimointi</div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => onChangePreset("min-climb")}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                    terrainPreset === "min-climb"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  Vähiten nousua
                </button>
                <button
                  type="button"
                  onClick={() => onChangePreset("balanced")}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                    terrainPreset === "balanced"
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  Tasapainoinen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {hasOriginalGeojson && (
        <button
          type="button"
          disabled={terrainRouting}
          className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 transition"
          onClick={onRestoreOriginal}
          title="Palauta alkuperäinen suora mittaus"
        >
          <Undo2 size={13} /> Palauta
        </button>
      )}
    </>
  );
}
