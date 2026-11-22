import type { Dispatch, SetStateAction } from "react";

interface CoordsSectionProps {
  draft: Record<string, string>;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
}

const INFOBOX_TOGGLES: Array<{ key: string; label: string }> = [
  { key: "showWgs", label: "WGS84-maantieteelliset koordinaatit" },
  { key: "showEtrs", label: "ETRS-TM35FIN-tasokoordinaatit" },
  { key: "showElev", label: "Maaston korkeustieto (m mpy)" },
  { key: "showWeather", label: "Paikallissää (vaatii API-avaimen)" },
  { key: "showSunTimes", label: "Auringon nousu- ja laskuajat" },
  { key: "copyCoordsOnClick", label: "Kopioi koordinaatit klikkaamalla" },
];

export function CoordsSection({ draft, setDraft }: CoordsSectionProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
            Koordinaattien esitysmuoto:
          </span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            value={draft.coordFormat ?? "decimal"}
            onChange={(e) => setDraft({ ...draft, coordFormat: e.target.value })}
          >
            <option value="decimal">Desimaaliasteet (60.1700° N, 24.9400° E)</option>
            <option value="dms">Asteet, minuutit, sekunnit DMS (60° 10′ 12″ N)</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">
            Mistä pisteestä tiedot haetaan:
          </span>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            value={draft.dataFetchMode ?? "mouse"}
            onChange={(e) => setDraft({ ...draft, dataFetchMode: e.target.value })}
          >
            <option value="mouse">Hiiren kursorin sijainti</option>
            <option value="center">Kartan keskipiste (Osoitin)</option>
          </select>
        </label>
      </div>

      <div className="border-t border-slate-200 pt-2 dark:border-zinc-800">
        <div className="mb-2 text-xs font-medium text-slate-600 dark:text-zinc-400">
          Tietolaatikossa näytettävät kentät:
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {INFOBOX_TOGGLES.map(({ key, label }) => (
            <label key={key} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-blue-600"
                checked={draft[key] !== "0"}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.checked ? "1" : "0" })}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
