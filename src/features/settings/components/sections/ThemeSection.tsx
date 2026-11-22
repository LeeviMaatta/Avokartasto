import type { Dispatch, SetStateAction } from "react";

interface ThemeSectionProps {
  draft: Record<string, string>;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
}

const UI_SCALE_PRESETS = [0.85, 1.0, 1.15, 1.3];

export function ThemeSection({ draft, setDraft }: ThemeSectionProps) {
  return (
    <>
      <label className="block">
        <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
          Käyttöliittymän tyyli:
        </span>
        <select
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          value={draft.uiStyle ?? "modern"}
          onChange={(e) => setDraft({ ...draft, uiStyle: e.target.value })}
        >
          <option value="modern">Moderni</option>
          <option value="classic">Klassinen</option>
          <option value="retro">Retro</option>
        </select>
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Väriteema:</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            value={draft.theme ?? "light"}
            onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
          >
            <option value="light">Vaalea</option>
            <option value="dark">Tumma</option>
          </select>
        </label>

        <label className="block">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-zinc-400">
            <span>Kartan päällä olevien paneelien läpinäkyvyys:</span>
            <span className="font-mono">
              {Math.round(Number(draft.uiOverlayOpacity ?? "1") * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.3"
            max="1"
            step="0.05"
            className="mt-2 w-full accent-blue-600"
            value={draft.uiOverlayOpacity ?? "1"}
            onChange={(e) => setDraft({ ...draft, uiOverlayOpacity: e.target.value })}
          />
        </label>
      </div>

      <div className="border-t border-slate-200 pt-2 dark:border-zinc-800">
        <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-zinc-400">
          <span>Käyttöliittymän skaalaus (UI Scale):</span>
          <span className="font-mono font-semibold">
            {Math.round(Number(draft.uiScale ?? "1") * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0.75"
          max="1.4"
          step="0.05"
          className="mt-2 w-full cursor-pointer accent-blue-600"
          value={draft.uiScale ?? "1"}
          onChange={(e) => setDraft({ ...draft, uiScale: e.target.value })}
        />
        <div className="mt-2 flex items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-zinc-400">
          <span>Pieni (75%)</span>
          <div className="flex gap-1.5">
            {UI_SCALE_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDraft({ ...draft, uiScale: s.toString() })}
                className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                  Math.abs(Number(draft.uiScale ?? "1") - s) < 0.02
                    ? "bg-blue-600 font-medium text-white"
                    : "bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {Math.round(s * 100)}%
              </button>
            ))}
          </div>
          <span>Suuri (140%)</span>
        </div>
      </div>

      <div className="border-t border-slate-200 pt-2 dark:border-zinc-800">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-blue-600"
            checked={draft.darkMapTiles === "1"}
            onChange={(e) => setDraft({ ...draft, darkMapTiles: e.target.checked ? "1" : "0" })}
          />
          <span>Käytä tummaa tilaa myös karttapohjille (Yökartta-suodatin)</span>
        </label>
      </div>
    </>
  );
}
