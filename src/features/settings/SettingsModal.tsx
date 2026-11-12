import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useMapStore } from "../../store/mapStore";
import { SETTING_KEYS, SETTING_TOGGLES, SETTING_VALUE_KEYS } from "./model/settingFields";

export default function SettingsModal() {
  const { settingsOpen, settings, setSettings } = useMapStore();
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    if (settingsOpen) {
      setDraft(settings);
    }
  }, [settingsOpen]);
  if (!settingsOpen) return null;

  const close = async () => {
    const values = Object.fromEntries(
      [...SETTING_KEYS.map(([k]) => k), ...SETTING_TOGGLES.map(([k]) => k), ...SETTING_VALUE_KEYS]
        .map((key) => [key, (draft[key] ?? "").trim()])
    );
    await setSettings({ ...settings, ...values, googleKey: "" });
    useMapStore.setState({ settingsOpen: false });
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-[640px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-white sm:p-5">
        <div className="mb-3 flex items-center justify-between text-lg font-semibold border-b pb-2 dark:border-gray-700">
          Asetukset <button onClick={close}><X /></button>
        </div>

        <h3 className="mb-1 font-semibold text-gray-700 dark:text-gray-200">API-avaimet</h3>
        {SETTING_KEYS.map(([k, label]) => (
          <label key={k} className="mb-2 block">
            <span className="text-gray-600 dark:text-gray-400 text-xs">{label}</span>
            <input type="password" className="mt-0.5 w-full rounded border dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1" value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
          </label>
        ))}

        <h3 className="mb-1 mt-4 font-semibold text-gray-700 dark:text-gray-200">Tietolaatikko & Osoitin</h3>
        <div className="grid grid-cols-2 gap-1 mb-3">
          {SETTING_TOGGLES.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={draft[k] !== "0"} onChange={(e) => setDraft({ ...draft, [k]: e.target.checked ? "1" : "0" })} />
              {label}
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <label className="block">
            <span className="text-gray-600 dark:text-gray-300 font-medium text-xs">Mistä pisteestä tiedot haetaan:</span>
            <select 
              className="mt-1 w-full rounded border dark:border-gray-600 px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
              value={draft.dataFetchMode ?? "mouse"}
              onChange={(e) => setDraft({ ...draft, dataFetchMode: e.target.value })}
            >
              <option value="mouse">Hiiren kursorin sijainti</option>
              <option value="center">Kartan keskipiste (Osoitin)</option>
            </select>
          </label>

          <label className="block">
            <span className="text-gray-600 dark:text-gray-300 font-medium text-xs">Osoittimen väri:</span>
            <div className="flex items-center gap-2 mt-1">
              <input 
                type="color" 
                className="h-8 w-12 rounded border dark:border-gray-600 bg-white dark:bg-gray-700 cursor-pointer"
                value={draft.crosshairColor || "#dc2626"}
                onChange={(e) => setDraft({ ...draft, crosshairColor: e.target.value })}
              />
              <span className="font-mono text-xs">{draft.crosshairColor || "#dc2626"}</span>
            </div>
          </label>
        </div>

        <h3 className="mb-1 mt-4 font-semibold text-gray-700 dark:text-gray-200">Käyttöliittymä</h3>
        <label className="mb-3 block">
          <span className="text-gray-600 dark:text-gray-300 font-medium text-xs">
            Kartan päällä olevien elementtien läpinäkyvyys: {Math.round(Number(draft.uiOverlayOpacity ?? "1") * 100)}%
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            className="mt-1 w-full accent-blue-600"
            value={draft.uiOverlayOpacity ?? "1"}
            onChange={(e) => setDraft({ ...draft, uiOverlayOpacity: e.target.value })}
          />
        </label>
        <label className="mb-3 block">
          <span className="text-gray-600 dark:text-gray-300 font-medium text-xs">Teema:</span>
          <select className="mt-1 w-full rounded border dark:border-gray-600 px-2 py-1 bg-white dark:bg-gray-700 dark:text-white" value={draft.theme ?? "light"} onChange={(e) => setDraft({ ...draft, theme: e.target.value })}>
            <option value="light">Vaalea</option>
            <option value="dark">Tumma</option>
          </select>
        </label>
        <h3 className="mb-1 mt-4 font-semibold text-gray-700 dark:text-gray-200">Mittaus ja yksiköt</h3>
        <label className="mb-3 block">
          <span className="text-gray-600 dark:text-gray-300 font-medium text-xs">Mittayksiköt:</span>
          <select
            className="mt-1 w-full rounded border dark:border-gray-600 px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
            value={draft.measurementUnits ?? "metric"}
            onChange={(e) => setDraft({ ...draft, measurementUnits: e.target.value })}
          >
            <option value="metric">Metrit ja kilometrit</option>
            <option value="imperial">Jalat ja mailit</option>
          </select>
        </label>
        <label className="mb-3 block">
          <span className="text-gray-600 dark:text-gray-300 font-medium text-xs">Mittauksen tyyppi:</span>
          <select
            className="mt-1 w-full rounded border dark:border-gray-600 px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
            value={draft.measurementType ?? "distance"}
            onChange={(e) => setDraft({ ...draft, measurementType: e.target.value })}
          >
            <option value="distance">Etäisyys ja korkeusprofiili</option>
            <option value="area">Pinta-ala</option>
          </select>
        </label>

        <div className="mt-5 flex justify-end border-t dark:border-gray-700 pt-4">
          <span className="text-xs text-gray-500 dark:text-gray-400">Asetukset tallennetaan, kun ikkuna suljetaan.</span>
        </div>
      </div>
    </div>
  );
}