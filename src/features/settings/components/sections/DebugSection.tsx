import type { Dispatch, SetStateAction } from "react";
import {
  DEBUG_CATEGORIES,
  DEBUG_VALUES,
  DEFAULT_DEBUG_SETTINGS,
  type DebugSettings,
} from "../../../debug/model/debugTypes";
import { downloadDebugReport } from "../../services/debugReportExport";

interface DebugSectionProps {
  debugDraft: DebugSettings;
  setDebugDraft: Dispatch<SetStateAction<DebugSettings>>;
  debugDataOpen: boolean;
  setDebugDataOpen: Dispatch<SetStateAction<boolean>>;
}

export function DebugSection({
  debugDraft,
  setDebugDraft,
  debugDataOpen,
  setDebugDataOpen,
}: DebugSectionProps) {
  return (
    <>
      <label className="flex cursor-pointer items-center gap-2.5 font-medium">
        <input
          type="checkbox"
          className="h-4 w-4 rounded accent-blue-600"
          checked={debugDraft.enabled}
          onChange={(e) => setDebugDraft({ ...debugDraft, enabled: e.target.checked })}
        />
        <span>Näytä Debug-overlay kartalla</span>
      </label>
      <p className="text-xs text-slate-500 dark:text-zinc-400">
        Näyttää reaaliaikaiset renderöinti-, välimuisti- ja suorituskykytiedot kartan päällä.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
            Sijainti ruudulla
          </span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            value={debugDraft.position}
            onChange={(e) =>
              setDebugDraft({
                ...debugDraft,
                position: e.target.value as DebugSettings["position"],
                customPosition: null,
              })
            }
          >
            <option value="top-left">Ylävasen</option>
            <option value="top-right">Yläoikea</option>
            <option value="bottom-left">Alavasen</option>
            <option value="bottom-right">Alaoikea</option>
          </select>
        </label>
        <label className="block">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-zinc-400">
            <span>Overlayn läpinäkyvyys</span>
            <span className="font-mono">{Math.round(debugDraft.opacity * 100)}%</span>
          </div>
          <input
            className="mt-2 w-full accent-blue-600"
            type="range"
            min="0.6"
            max="1"
            step="0.05"
            value={debugDraft.opacity}
            onChange={(e) => setDebugDraft({ ...debugDraft, opacity: Number(e.target.value) })}
          />
        </label>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          className="h-4 w-4 rounded accent-blue-600"
          checked={debugDraft.compactMode}
          onChange={(e) => setDebugDraft({ ...debugDraft, compactMode: e.target.checked })}
        />
        <span>Kompakti tila (vähemmän selitetekstejä)</span>
      </label>

      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          className="h-4 w-4 rounded accent-blue-600"
          checked={debugDraft.showTileBoundaries}
          onChange={(e) => setDebugDraft({ ...debugDraft, showTileBoundaries: e.target.checked })}
        />
        <span>Näytä tiilien rajat kartalla (graafinen ruudukko)</span>
      </label>

      <div className="rounded-lg border border-slate-200 dark:border-zinc-700">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-zinc-300"
          onClick={() => setDebugDataOpen((open) => !open)}
        >
          <span>
            Valitut mittauskategoriat ({Object.values(debugDraft.categories).filter(Boolean).length}{" "}
            / {DEBUG_CATEGORIES.length})
          </span>
          <span aria-hidden>{debugDataOpen ? "−" : "+"}</span>
        </button>
        {debugDataOpen && (
          <div className="space-y-3 border-t border-slate-200 p-3 dark:border-zinc-700">
            {DEBUG_CATEGORIES.map((category) => {
              const enabledValues = DEBUG_VALUES[category.id].filter(
                (value) => debugDraft.values[value.id],
              ).length;
              return (
                <div key={category.id} className="space-y-1">
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded accent-blue-600"
                      checked={debugDraft.categories[category.id]}
                      onChange={(e) =>
                        setDebugDraft({
                          ...debugDraft,
                          categories: { ...debugDraft.categories, [category.id]: e.target.checked },
                        })
                      }
                    />
                    <span>{category.label}</span>
                    <span className="text-[11px] text-slate-500">
                      ({enabledValues} / {DEBUG_VALUES[category.id].length})
                    </span>
                  </label>
                  <p className="ml-5 text-[11px] text-slate-500 dark:text-zinc-400">
                    {category.description}
                  </p>
                  <div className="ml-5 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {DEBUG_VALUES[category.id].map((value) => (
                      <label key={value.id} className="flex items-center gap-1.5 text-[11px]">
                        <input
                          type="checkbox"
                          className="h-3 w-3 rounded accent-blue-600"
                          checked={debugDraft.values[value.id] ?? false}
                          onChange={(e) =>
                            setDebugDraft({
                              ...debugDraft,
                              values: { ...debugDraft.values, [value.id]: e.target.checked },
                            })
                          }
                        />
                        <span>{value.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          onClick={() => setDebugDraft(DEFAULT_DEBUG_SETTINGS)}
        >
          Palauta debug-oletukset
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          onClick={() => downloadDebugReport(debugDraft)}
        >
          Vie diagnostiikkaraportti (.json)
        </button>
      </div>
    </>
  );
}
