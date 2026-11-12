import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import { useMapStore } from "../../store/mapStore";
import { deleteFeature, listFeatures, type UserFeature } from "../../services/tauriBridge";

const KEYS: [string, string][] = [
  ["mmlKey", "Maanmittauslaitoksen API-avain"],
  ["lantmaterietUsername", "Lantmäteriet sähköposti (Topowebb)"],
  ["lantmaterietPassword", "Lantmäteriet salasana (Topowebb)"],
  ["owmKey", "OpenWeatherMap API-avain"],
];
const TOGGLES: [string, string][] = [
  ["showWgs", "WGS84-koordinaatit"],
  ["showEtrs", "ETRS-TM35FIN-koordinaatit"],
  ["showElev", "Maaston korkeus"],
  ["showWeather", "Paikallissää"],
  ["showCenterCrosshair", "Näytä keskikohdan osoitin"],
  ["tileCache", "Käytä karttalaattojen välimuistia"],
  ["showLayerErrors", "Näytä karttatason virheilmoitukset"],
];

export default function SettingsModal() {
  const { settingsOpen, settings, setSettings, bumpFeatures } = useMapStore();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [feats, setFeats] = useState<UserFeature[]>([]);

  useEffect(() => {
    if (settingsOpen) {
      setDraft(settings);
      listFeatures().then(setFeats);
    }
  }, [settingsOpen]);
  if (!settingsOpen) return null;

  const close = () => useMapStore.setState({ settingsOpen: false });
  const saveSettings = async () => {
    const values = Object.fromEntries(
      [...KEYS.map(([k]) => k), ...TOGGLES.map(([k]) => k), "dataFetchMode", "crosshairColor", "measurementUnits", "measurementType"]
        .map((key) => [key, (draft[key] ?? "").trim()])
    );
    await setSettings({ ...settings, ...values, googleKey: "" });
    close();
  };
  const confirmAndDeleteFeature = async (id: number, title: string) => {
    if (window.confirm(`Haluatko varmasti poistaa merkinnän "${title}"?`)) {
      await deleteFeature(id);
      setFeats(await listFeatures());
      bumpFeatures();
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-[640px] overflow-y-auto rounded-xl bg-white p-4 text-sm shadow-2xl dark:bg-gray-800 dark:text-white sm:p-5 border dark:border-gray-700">
        <div className="mb-3 flex items-center justify-between text-lg font-semibold border-b pb-2 dark:border-gray-700">
          Asetukset <button onClick={close}><X /></button>
        </div>

        <h3 className="mb-1 font-semibold text-gray-700 dark:text-gray-200">API-avaimet</h3>
        {KEYS.map(([k, label]) => (
          <label key={k} className="mb-2 block">
            <span className="text-gray-600 dark:text-gray-400 text-xs">{label}</span>
            <input type="password" className="mt-0.5 w-full rounded border dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1" value={draft[k] ?? ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
          </label>
        ))}

        <h3 className="mb-1 mt-4 font-semibold text-gray-700 dark:text-gray-200">Tietolaatikko & Osoitin</h3>
        <div className="grid grid-cols-2 gap-1 mb-3">
          {TOGGLES.map(([k, label]) => (
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

        <h3 className="mb-1 mt-4 font-semibold text-gray-700 dark:text-gray-200">Tallennetut merkinnät</h3>
        {feats.length === 0 && <p className="text-gray-500 dark:text-gray-400 text-xs">Ei merkintöjä.</p>}
        {feats.map((f) => (
          <div key={f.id} className="mb-1 flex items-center justify-between rounded bg-gray-100 dark:bg-gray-900 px-2 py-1 text-xs">
            <span>{f.title} <span className="text-xs text-gray-500">({f.feature_type}, {f.created_at})</span></span>
            <button onClick={() => confirmAndDeleteFeature(f.id, f.title)}><Trash2 size={14} /></button>
          </div>
        ))}

        <div className="mt-5 flex justify-end gap-2 border-t dark:border-gray-700 pt-4">
          <button className="rounded border dark:border-gray-600 px-3 py-1.5" onClick={close}>Peruuta</button>
          <button className="rounded bg-blue-600 px-3 py-1.5 text-white font-medium hover:bg-blue-700" onClick={saveSettings}>Tallenna</button>
        </div>
      </div>
    </div>
  );
}