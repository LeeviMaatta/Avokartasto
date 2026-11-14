import type { Dispatch, SetStateAction } from "react";
import type { MapSource } from "../../../shared/types/sourceTypes";
import {
  BACKDROP_MAX_ZOOM,
  abortBackdropPreload,
  preloadBackdropLayer,
  type BackdropCacheStatus,
} from "../../map/services/backdropCache";
import { requiredSecrets } from "../../map/services/resolveUrl";

interface BackdropPreloadPanelProps {
  draft: Record<string, string>;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
  sources: MapSource[];
  centerCoord: [number, number] | null;
  backdropStatus: BackdropCacheStatus;
}

export function BackdropPreloadPanel({
  draft,
  setDraft,
  sources,
  centerCoord,
  backdropStatus,
}: BackdropPreloadPanelProps) {
  const selectedBackdropId = draft.backdropLayerId ?? "";
  const tileCompatible = sources.filter(
    (s) =>
      (s.url.trim() || s.base_path.trim()) &&
      (s.api_type === "xyz" ||
        s.api_type === "wmts" ||
        s.api_type === "wms" ||
        s.api_type === "local_tile" ||
        s.api_type === "vector_tile"),
  );
  const basemapChoices = tileCompatible.filter((s) => s.role === "basemap");
  const overlayChoices = tileCompatible.filter((s) => s.role === "overlay");
  const selectedSource = tileCompatible.find((s) => `src:${s.id}` === selectedBackdropId);
  const missingKeys = selectedSource
    ? requiredSecrets(selectedSource).filter((key) => !(draft[key] ?? "").trim())
    : [];
  const effectiveMax = selectedSource
    ? Math.min(selectedSource.max_zoom || BACKDROP_MAX_ZOOM, BACKDROP_MAX_ZOOM)
    : BACKDROP_MAX_ZOOM;
  const statusMatchesSelected =
    Boolean(selectedBackdropId) && backdropStatus.sourceId === selectedBackdropId;

  const triggerBackdropPreload = (id: string, force = false) => {
    if (!id) {
      abortBackdropPreload();
      return;
    }
    const targetSource = tileCompatible.find((s) => `src:${s.id}` === id);
    if (!targetSource) return;
    void preloadBackdropLayer({
      source: targetSource,
      settings: draft,
      centerCoord,
      force,
    });
  };

  return (
    <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">
          Kaikkien karttojen taustakerros (välimuistitettu)
        </span>
        {selectedSource && (
          <button
            type="button"
            onClick={() => triggerBackdropPreload(selectedBackdropId, true)}
            disabled={backdropStatus.loading && statusMatchesSelected}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {backdropStatus.loading && statusMatchesSelected ? "Ladataan..." : "Lataa nykyinen alue"}
          </button>
        )}
      </div>
      <select
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        value={selectedBackdropId}
        onChange={(e) => {
          const nextId = e.target.value;
          setDraft({ ...draft, backdropLayerId: nextId });
          triggerBackdropPreload(nextId);
        }}
      >
        <option value="">Ei käytössä</option>
        {basemapChoices.length > 0 && (
          <optgroup label="Pohjakartat">
            {basemapChoices.map((s) => (
              <option key={s.id} value={`src:${s.id}`}>
                {s.name} (maks. zoom {Math.min(s.max_zoom || BACKDROP_MAX_ZOOM, BACKDROP_MAX_ZOOM)})
              </option>
            ))}
          </optgroup>
        )}
        {overlayChoices.length > 0 && (
          <optgroup label="Päällyskartat">
            {overlayChoices.map((s) => (
              <option key={s.id} value={`src:${s.id}`}>
                {s.name} (maks. zoom {Math.min(s.max_zoom || BACKDROP_MAX_ZOOM, BACKDROP_MAX_ZOOM)})
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
        Näytetään kaikkien muiden karttatasojen taustalla. Esilataus optimoidaan lataamalla tasot korkeammalta zoom-tasolle {BACKDROP_MAX_ZOOM} asti; tarkemmilla tasoilla näytetään skaalattu taso {BACKDROP_MAX_ZOOM}.
      </p>
      {missingKeys.length > 0 && (
        <div className="text-[11px] text-amber-600 dark:text-amber-400">
          Valittu taso vaatii API-avaimen/tunnukset ({missingKeys.join(", ")}), jotka voi lisätä API-avaimet-osiossa.
        </div>
      )}
      {statusMatchesSelected && backdropStatus.total > 0 && (
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-zinc-300">
            <span>
              {backdropStatus.loading
                ? `Ladataan välimuistiin: ${backdropStatus.loaded + backdropStatus.failed} / ${backdropStatus.total} laattaa (tasot 0–${effectiveMax})`
                : `Välimuistissa ${backdropStatus.loaded} / ${backdropStatus.total} laattaa (tasot 0–${effectiveMax})${backdropStatus.failed > 0 ? `, ${backdropStatus.failed} epäonnistui` : ""}`}
            </span>
            <span className="font-mono">
              {Math.round(((backdropStatus.loaded + backdropStatus.failed) / backdropStatus.total) * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800">
            <div
              className={`h-full transition-all ${backdropStatus.loading ? "bg-blue-600" : "bg-emerald-600"}`}
              style={{
                width: `${Math.min(100, Math.round(((backdropStatus.loaded + backdropStatus.failed) / backdropStatus.total) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
