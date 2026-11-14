import type { Dispatch, SetStateAction } from "react";

interface MeasureSectionProps {
  draft: Record<string, string>;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
}

export function MeasureSection({ draft, setDraft }: MeasureSectionProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Mittayksiköt:</span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            value={draft.measurementUnits ?? "metric"}
            onChange={(e) => setDraft({ ...draft, measurementUnits: e.target.value })}
          >
            <option value="metric">Metrijärjestelmä (metrit ja kilometrit)</option>
            <option value="imperial">Brittiläinen (jalat ja mailit)</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
            Oletusmittaustyyppi:
          </span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            value={draft.measurementType ?? "distance"}
            onChange={(e) => setDraft({ ...draft, measurementType: e.target.value })}
          >
            <option value="distance">Etäisyys ja korkeusprofiili</option>
            <option value="area">Pinta-ala</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
            Pinta-alan esitysmuoto:
          </span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            value={draft.areaUnit ?? "auto"}
            onChange={(e) => setDraft({ ...draft, areaUnit: e.target.value })}
          >
            <option value="auto">Automaattinen (m², ha, km²)</option>
            <option value="ha">Aina hehtaareina (ha)</option>
            <option value="m2">Aina neliömetreinä (m²)</option>
            <option value="km2">Aina neliökilometreinä (km²)</option>
          </select>
        </label>
      </div>

      <div className="space-y-2.5 border-t border-slate-200 pt-2 dark:border-zinc-800">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-blue-600"
            checked={draft.showSegmentLengths !== "0"}
            onChange={(e) => setDraft({ ...draft, showSegmentLengths: e.target.checked ? "1" : "0" })}
          />
          <span>Näytä mittausviivan välipisteiden osapituudet</span>
        </label>

        {draft.showSegmentLengths !== "0" && (
          <div className="ml-6 space-y-3 rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
            <label className="block">
              <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-zinc-400">
                <span>Osapituusmerkintöjen vähimmäisväli:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
                  {Number(draft.segmentLengthMinDistance ?? "500") <= 0
                    ? "0 m (kaikki pisteet)"
                    : `${draft.segmentLengthMinDistance ?? "500"} m`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2000"
                step="50"
                className="mt-2 w-full cursor-pointer accent-blue-600"
                value={draft.segmentLengthMinDistance ?? "500"}
                onChange={(e) => setDraft({ ...draft, segmentLengthMinDistance: e.target.value })}
              />
              <div className="mt-1 flex justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                <span>0 m</span>
                <span>2000 m</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
                Kun pisteet ovat tätä lähempänä toisiaan, välistä ohitetut pätkät lasketaan yhteen reittiä pitkin, jotta pituudet eivät vääristy.
              </p>
            </label>

            <div className="space-y-2 border-t border-slate-200 pt-2.5 dark:border-zinc-800">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded accent-blue-600"
                  checked={draft.hideSegmentLengthsByZoom !== "0"}
                  onChange={(e) =>
                    setDraft({ ...draft, hideSegmentLengthsByZoom: e.target.checked ? "1" : "0" })
                  }
                />
                <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                  Piilota pisteiden välimatkat kauemmas zoomattaessa
                </span>
              </label>

              {draft.hideSegmentLengthsByZoom !== "0" && (
                <label className="block pl-6">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-zinc-400">
                    <span>Vähimmäis zoom-taso merkinnöille:</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200">
                      zoom-taso {draft.segmentLengthsMinZoom ?? "13"}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="18"
                    step="1"
                    className="mt-1.5 w-full cursor-pointer accent-blue-600"
                    value={draft.segmentLengthsMinZoom ?? "13"}
                    onChange={(e) => setDraft({ ...draft, segmentLengthsMinZoom: e.target.value })}
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-slate-500 dark:text-zinc-400">
                    <span>zoom-taso 5 (kaukaa)</span>
                    <span>zoom-taso 18 (läheltä)</span>
                  </div>
                </label>
              )}
            </div>
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            className="h-4 w-4 rounded accent-blue-600"
            checked={draft.enableTerrainRouting !== "0"}
            onChange={(e) => setDraft({ ...draft, enableTerrainRouting: e.target.checked ? "1" : "0" })}
          />
          <span>Näytä maastoreittitoiminto etäisyysmittauksessa (kokeellinen)</span>
        </label>
      </div>
    </>
  );
}
