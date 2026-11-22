import type { Dispatch, SetStateAction } from "react";
import { Check } from "lucide-react";
import type { MapSource } from "../../../../shared/types/sourceTypes";
import type { BackdropCacheStatus } from "../../../map/services/backdropCache";
import { BackdropPreloadPanel } from "../BackdropPreloadPanel";

interface MapSectionProps {
  draft: Record<string, string>;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
  savedInitialView: boolean;
  onSaveInitialView: () => void;
  onClearInitialView: () => void;
  sources: MapSource[];
  centerCoord: [number, number] | null;
  backdropStatus: BackdropCacheStatus;
}

const MAP_TOGGLES: Array<{ key: string; label: string; defaultOn: boolean }> = [
  { key: "showScaleLine", label: "Näytä mittakaavajana", defaultOn: true },
  { key: "showZoomControls", label: "Näytä zoom-painikkeet (+/-)", defaultOn: true },
  { key: "showCenterCrosshair", label: "Näytä keskipisteen osoitin", defaultOn: true },
  { key: "showCompass", label: "Pohjoisnuoli / kompassi", defaultOn: true },
  { key: "showGraticule", label: "Koordinaattiristikko kartalla", defaultOn: false },
  { key: "showFullscreenControl", label: "Näytä koko ruudun painike", defaultOn: true },
  { key: "showOverviewMap", label: "Näytä yleiskatsauskartta (Minikartta)", defaultOn: false },
  { key: "showGeolocation", label: "Näytä 'Oma sijainti' -painike", defaultOn: true },
  { key: "kineticPanning", label: "Sulava kartan liukuminen (Inertia)", defaultOn: true },
  { key: "tileCache", label: "Käytä karttalaattojen välimuistia", defaultOn: true },
  { key: "showLayerErrors", label: "Näytä tasojen latausvirheet", defaultOn: true },
];

export function MapSection({
  draft,
  setDraft,
  savedInitialView,
  onSaveInitialView,
  onClearInitialView,
  sources,
  centerCoord,
  backdropStatus,
}: MapSectionProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {MAP_TOGGLES.map(({ key, label, defaultOn }) => (
          <label key={key} className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded accent-blue-600"
              checked={defaultOn ? draft[key] !== "0" : draft[key] === "1"}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.checked ? "1" : "0" })}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-2 dark:border-zinc-800 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
            Keskipisteen osoittimen väri:
          </span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="color"
              className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
              value={draft.crosshairColor || "#dc2626"}
              onChange={(e) => setDraft({ ...draft, crosshairColor: e.target.value })}
            />
            <span className="font-mono text-xs">{draft.crosshairColor || "#dc2626"}</span>
          </div>
        </label>

        <div className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
            Aloitusnäkymä sovellusta avattaessa:
          </span>
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSaveInitialView}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              {savedInitialView ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : null}
              <span>{savedInitialView ? "Näkymä tallennettu!" : "Aseta nykyinen aloitusnäkymäksi"}</span>
            </button>
            {draft.initialMapCenter && (
              <button
                type="button"
                onClick={onClearInitialView}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                title="Käytä automaattisesti edellisen istunnon sijaintia"
              >
                Palauta automaattinen
              </button>
            )}
          </div>
          {draft.initialMapCenter && (
            <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">
              Lukittu aloitussijainti käytössä.
            </div>
          )}
        </div>
      </div>

      <BackdropPreloadPanel
        draft={draft}
        setDraft={setDraft}
        sources={sources}
        centerCoord={centerCoord}
        backdropStatus={backdropStatus}
      />
    </>
  );
}
