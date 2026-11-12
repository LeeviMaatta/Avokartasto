import { useEffect, useRef, useState } from "react";
import { 
  X, 
  ChevronDown, 
  ChevronRight, 
  Palette, 
  Map as MapIcon, 
  Compass, 
  Ruler, 
  KeyRound, 
  Bug, 
  Check 
} from "lucide-react";
import { useMapStore } from "../../store/mapStore";
import { SETTING_KEYS, SETTING_TOGGLES, SETTING_VALUE_KEYS } from "./model/settingFields";
import { parseOpenSections } from "./model/persistedUiState";

const DEFAULT_OPEN_SECTIONS: Record<string, boolean> = {
  theme: true,
  map: true,
  coords: false,
  measure: false,
  api: false,
  debug: false,
};
import { useDebugStore } from "../debug/debugStore";
import { 
  DEBUG_CATEGORIES, 
  DEBUG_VALUES, 
  DEFAULT_DEBUG_SETTINGS, 
  parseDebugSettings, 
  type DebugSettings 
} from "../debug/model/debugTypes";

export default function SettingsModal() {
  const { settingsOpen, settings, setSettings } = useMapStore();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [debugDraft, setDebugDraft] = useState<DebugSettings>(DEFAULT_DEBUG_SETTINGS);
  const [debugDataOpen, setDebugDataOpen] = useState(false);
  const [savedInitialView, setSavedInitialView] = useState(false);
  
  // Accordion sections
  const openSections = parseOpenSections(settings.settingsOpenSections, DEFAULT_OPEN_SECTIONS);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const debugDraftRef = useRef(debugDraft);
  debugDraftRef.current = debugDraft;

  useEffect(() => {
    if (settingsOpen) {
      setDraft(settings);
      setDebugDraft(parseDebugSettings(settings.debugSettings));
      setDebugDataOpen(false);
      setSavedInitialView(false);
    }
  }, [settingsOpen, settings]);

  const toggleSection = (key: string) => {
    const next = { ...openSections, [key]: !openSections[key] };
    void useMapStore.getState().setSetting("settingsOpenSections", JSON.stringify(next));
  };

  const close = async () => {
    const currentDraft = draftRef.current;
    const currentDebug = debugDraftRef.current;
    const values = Object.fromEntries(
      [...SETTING_KEYS.map(([k]) => k), ...SETTING_TOGGLES.map(([k]) => k), ...SETTING_VALUE_KEYS]
        .map((key) => [key, (currentDraft[key] ?? "").trim()])
    );
    await setSettings({ 
      ...settings, 
      ...values, 
      initialMapCenter: currentDraft.initialMapCenter ?? "",
      initialMapZoom: currentDraft.initialMapZoom ?? "",
      debugSettings: JSON.stringify(currentDebug), 
      googleKey: "" 
    });
    useDebugStore.setState({ settings: currentDebug });
    useMapStore.setState({ settingsOpen: false });
  };

  // Close on Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void close();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsOpen]);

  const handleSaveInitialView = () => {
    const currentCoord = useMapStore.getState().centerCoord;
    const currentSettings = useMapStore.getState().settings;
    if (currentCoord) {
      setDraft((prev) => ({
        ...prev,
        initialMapCenter: JSON.stringify(currentCoord),
        initialMapZoom: currentSettings.lastMapZoom || "10",
      }));
      setSavedInitialView(true);
      setTimeout(() => setSavedInitialView(false), 2500);
    }
  };

  const handleClearInitialView = () => {
    setDraft((prev) => ({
      ...prev,
      initialMapCenter: "",
      initialMapZoom: "",
    }));
  };

  if (!settingsOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 backdrop-blur-xs transition-opacity sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) void close();
      }}
    >
      <div 
        className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-[680px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 shadow-2xl transition-all dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-heading"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-zinc-800 sm:px-6">
          <h2 id="settings-heading" className="text-lg font-bold text-slate-900 dark:text-white">
            Asetukset
          </h2>
          <button 
            type="button"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" 
            onClick={() => void close()}
            title="Sulje (Esc)"
            aria-label="Sulje asetukset"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Content with Collapsible Sections */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">

          {/* Section 1: Ulkoasu & Teema */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 transition-colors dark:border-zinc-800 dark:bg-zinc-900/40">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-800 dark:text-zinc-200"
              onClick={() => toggleSection("theme")}
              aria-expanded={openSections.theme}
            >
              <div className="flex items-center gap-2">
                <Palette size={18} className="text-blue-600 dark:text-blue-400" />
                <span>Ulkoasu & Teema</span>
              </div>
              {openSections.theme ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            {openSections.theme && (
              <div className="space-y-4 border-t border-slate-200 p-4 dark:border-zinc-800">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Käyttöliittymän tyyli:</span>
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
                      <span className="font-mono">{Math.round(Number(draft.uiOverlayOpacity ?? "1") * 100)}%</span>
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

                <div className="pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-zinc-400">
                    <span>Käyttöliittymän skaalaus (UI Scale):</span>
                    <span className="font-mono font-semibold">{Math.round(Number(draft.uiScale ?? "1") * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.4"
                    step="0.05"
                    className="mt-2 w-full accent-blue-600 cursor-pointer"
                    value={draft.uiScale ?? "1"}
                    onChange={(e) => setDraft({ ...draft, uiScale: e.target.value })}
                  />
                  <div className="mt-2 flex items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-zinc-400">
                    <span>Pieni (75%)</span>
                    <div className="flex gap-1.5">
                      {[0.85, 1.0, 1.15, 1.3].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setDraft({ ...draft, uiScale: s.toString() })}
                          className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${
                            Math.abs(Number(draft.uiScale ?? "1") - s) < 0.02
                              ? "bg-blue-600 text-white font-medium"
                              : "bg-slate-200 hover:bg-slate-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300"
                          }`}
                        >
                          {Math.round(s * 100)}%
                        </button>
                      ))}
                    </div>
                    <span>Suuri (140%)</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.darkMapTiles === "1"}
                      onChange={(e) => setDraft({ ...draft, darkMapTiles: e.target.checked ? "1" : "0" })}
                    />
                    <span>Käytä tummaa tilaa myös karttapohjille (Yökartta-suodatin)</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Karttanäkymä & Säätimet */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 transition-colors dark:border-zinc-800 dark:bg-zinc-900/40">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-800 dark:text-zinc-200"
              onClick={() => toggleSection("map")}
              aria-expanded={openSections.map}
            >
              <div className="flex items-center gap-2">
                <MapIcon size={18} className="text-blue-600 dark:text-blue-400" />
                <span>Karttanäkymä & Säätimet</span>
              </div>
              {openSections.map ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            {openSections.map && (
              <div className="space-y-4 border-t border-slate-200 p-4 dark:border-zinc-800">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.showScaleLine !== "0"}
                      onChange={(e) => setDraft({ ...draft, showScaleLine: e.target.checked ? "1" : "0" })}
                    />
                    <span>Näytä mittakaavajana</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.showZoomControls !== "0"}
                      onChange={(e) => setDraft({ ...draft, showZoomControls: e.target.checked ? "1" : "0" })}
                    />
                    <span>Näytä zoom-painikkeet (+/-)</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.enableRotation !== "0"}
                      onChange={(e) => setDraft({ ...draft, enableRotation: e.target.checked ? "1" : "0" })}
                    />
                    <span>Salli kartan kierto (Alt+Shift+veto)</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.showCenterCrosshair !== "0"}
                      onChange={(e) => setDraft({ ...draft, showCenterCrosshair: e.target.checked ? "1" : "0" })}
                    />
                    <span>Näytä keskipisteen osoitin</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.showCompass !== "0"}
                      onChange={(e) => setDraft({ ...draft, showCompass: e.target.checked ? "1" : "0" })}
                    />
                    <span>Pohjoisnuoli / kompassi</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.showGraticule === "1"}
                      onChange={(e) => setDraft({ ...draft, showGraticule: e.target.checked ? "1" : "0" })}
                    />
                    <span>Koordinaattiristikko kartalla</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.enableDoubleClickZoom === "1"}
                      onChange={(e) => setDraft({ ...draft, enableDoubleClickZoom: e.target.checked ? "1" : "0" })}
                    />
                    <span>Zoomaa kaksoisklikkauksella</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.removePendingMarkerOnDblClick !== "0"}
                      onChange={(e) => setDraft({ ...draft, removePendingMarkerOnDblClick: e.target.checked ? "1" : "0" })}
                    />
                    <span>Poista tallentamaton merkki kaksoisklikkauksella</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.showFullscreenControl !== "0"}
                      onChange={(e) => setDraft({ ...draft, showFullscreenControl: e.target.checked ? "1" : "0" })}
                    />
                    <span>Näytä koko ruudun painike</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.showOverviewMap === "1"}
                      onChange={(e) => setDraft({ ...draft, showOverviewMap: e.target.checked ? "1" : "0" })}
                    />
                    <span>Näytä yleiskatsauskartta (Minikartta)</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.showGeolocation !== "0"}
                      onChange={(e) => setDraft({ ...draft, showGeolocation: e.target.checked ? "1" : "0" })}
                    />
                    <span>Näytä 'Oma sijainti' -painike</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.kineticPanning !== "0"}
                      onChange={(e) => setDraft({ ...draft, kineticPanning: e.target.checked ? "1" : "0" })}
                    />
                    <span>Sulava kartan liukuminen (Inertia)</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.tileCache !== "0"}
                      onChange={(e) => setDraft({ ...draft, tileCache: e.target.checked ? "1" : "0" })}
                    />
                    <span>Käytä karttalaattojen välimuistia</span>
                  </label>

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.showLayerErrors !== "0"}
                      onChange={(e) => setDraft({ ...draft, showLayerErrors: e.target.checked ? "1" : "0" })}
                    />
                    <span>Näytä tasojen latausvirheet</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Keskipisteen osoittimen väri:</span>
                    <div className="flex items-center gap-2 mt-1">
                      <input 
                        type="color" 
                        className="h-8 w-12 rounded border border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 cursor-pointer"
                        value={draft.crosshairColor || "#dc2626"}
                        onChange={(e) => setDraft({ ...draft, crosshairColor: e.target.value })}
                      />
                      <span className="font-mono text-xs">{draft.crosshairColor || "#dc2626"}</span>
                    </div>
                  </label>

                  <div className="block">
                    <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Aloitusnäkymä sovellusta avattaessa:</span>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleSaveInitialView}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      >
                        {savedInitialView ? <Check size={14} className="text-emerald-600 dark:text-emerald-400" /> : null}
                        <span>{savedInitialView ? "Näkymä tallennettu!" : "Aseta nykyinen aloitusnäkymäksi"}</span>
                      </button>
                      {draft.initialMapCenter && (
                        <button
                          type="button"
                          onClick={handleClearInitialView}
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
              </div>
            )}
          </div>

          {/* Section 3: Koordinaatit & Tietolaatikko */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 transition-colors dark:border-zinc-800 dark:bg-zinc-900/40">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-800 dark:text-zinc-200"
              onClick={() => toggleSection("coords")}
              aria-expanded={openSections.coords}
            >
              <div className="flex items-center gap-2">
                <Compass size={18} className="text-blue-600 dark:text-blue-400" />
                <span>Koordinaatit & Tietolaatikko</span>
              </div>
              {openSections.coords ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            {openSections.coords && (
              <div className="space-y-4 border-t border-slate-200 p-4 dark:border-zinc-800">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Koordinaattien esitysmuoto:</span>
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
                    <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Mistä pisteestä tiedot haetaan:</span>
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

                <div className="pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <div className="mb-2 text-xs font-medium text-slate-600 dark:text-zinc-400">Tietolaatikossa näytettävät kentät:</div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded accent-blue-600"
                        checked={draft.showWgs !== "0"} 
                        onChange={(e) => setDraft({ ...draft, showWgs: e.target.checked ? "1" : "0" })} 
                      />
                      <span>WGS84-maantieteelliset koordinaatit</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded accent-blue-600"
                        checked={draft.showEtrs !== "0"} 
                        onChange={(e) => setDraft({ ...draft, showEtrs: e.target.checked ? "1" : "0" })} 
                      />
                      <span>ETRS-TM35FIN-tasokoordinaatit</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded accent-blue-600"
                        checked={draft.showElev !== "0"} 
                        onChange={(e) => setDraft({ ...draft, showElev: e.target.checked ? "1" : "0" })} 
                      />
                      <span>Maaston korkeustieto (m mpy)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded accent-blue-600"
                        checked={draft.showWeather !== "0"} 
                        onChange={(e) => setDraft({ ...draft, showWeather: e.target.checked ? "1" : "0" })} 
                      />
                      <span>Paikallissää (vaatii API-avaimen)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded accent-blue-600"
                        checked={draft.showSunTimes !== "0"} 
                        onChange={(e) => setDraft({ ...draft, showSunTimes: e.target.checked ? "1" : "0" })} 
                      />
                      <span>Auringon nousu- ja laskuajat</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="h-4 w-4 rounded accent-blue-600"
                        checked={draft.copyCoordsOnClick !== "0"} 
                        onChange={(e) => setDraft({ ...draft, copyCoordsOnClick: e.target.checked ? "1" : "0" })} 
                      />
                      <span>Kopioi koordinaatit klikkaamalla</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Mittaus ja yksiköt */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 transition-colors dark:border-zinc-800 dark:bg-zinc-900/40">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-800 dark:text-zinc-200"
              onClick={() => toggleSection("measure")}
              aria-expanded={openSections.measure}
            >
              <div className="flex items-center gap-2">
                <Ruler size={18} className="text-blue-600 dark:text-blue-400" />
                <span>Mittaus & Yksiköt</span>
              </div>
              {openSections.measure ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            {openSections.measure && (
              <div className="space-y-4 border-t border-slate-200 p-4 dark:border-zinc-800">
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
                    <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Oletusmittaustyyppi:</span>
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
                    <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Pinta-alan esitysmuoto:</span>
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

                <div className="pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.showSegmentLengths !== "0"}
                      onChange={(e) => setDraft({ ...draft, showSegmentLengths: e.target.checked ? "1" : "0" })}
                    />
                    <span>Näytä mittausviivan välipisteiden osapituudet</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Section 5: API-avaimet */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 transition-colors dark:border-zinc-800 dark:bg-zinc-900/40">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-800 dark:text-zinc-200"
              onClick={() => toggleSection("api")}
              aria-expanded={openSections.api}
            >
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-blue-600 dark:text-blue-400" />
                <span>API-avaimet</span>
              </div>
              {openSections.api ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            {openSections.api && (
              <div className="space-y-3 border-t border-slate-200 p-4 dark:border-zinc-800">
                {SETTING_KEYS.map(([k, label]) => (
                  <label key={k} className="block">
                    <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">{label}</span>
                    <input 
                      type="password" 
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 font-mono text-xs" 
                      value={draft[k] ?? ""} 
                      onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} 
                      placeholder="Syötä avain tai tunnus..."
                    />
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Section 6: Diagnostiikka & Debug */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 transition-colors dark:border-zinc-800 dark:bg-zinc-900/40">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-800 dark:text-zinc-200"
              onClick={() => toggleSection("debug")}
              aria-expanded={openSections.debug}
            >
              <div className="flex items-center gap-2">
                <Bug size={18} className="text-blue-600 dark:text-blue-400" />
                <span>Diagnostiikka & Debug</span>
              </div>
              {openSections.debug ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            {openSections.debug && (
              <div className="space-y-4 border-t border-slate-200 p-4 dark:border-zinc-800">
                <label className="flex items-center gap-2.5 cursor-pointer font-medium">
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
                    <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">Sijainti ruudulla</span>
                    <select 
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" 
                      value={debugDraft.position} 
                      onChange={(e) => setDebugDraft({ ...debugDraft, position: e.target.value as DebugSettings["position"], customPosition: null })}
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

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 rounded accent-blue-600"
                    checked={debugDraft.compactMode} 
                    onChange={(e) => setDebugDraft({ ...debugDraft, compactMode: e.target.checked })} 
                  />
                  <span>Kompakti tila (vähemmän selitetekstejä)</span>
                </label>

                {/* Subcategory accordion */}
                <div className="rounded-lg border border-slate-200 dark:border-zinc-700">
                  <button 
                    type="button" 
                    className="flex w-full items-center justify-between px-3 py-2 text-left font-medium text-xs text-slate-700 dark:text-zinc-300" 
                    onClick={() => setDebugDataOpen((open) => !open)}
                  >
                    <span>Valitut mittauskategoriat ({Object.values(debugDraft.categories).filter(Boolean).length} / {DEBUG_CATEGORIES.length})</span>
                    <span aria-hidden>{debugDataOpen ? "−" : "+"}</span>
                  </button>
                  {debugDataOpen && (
                    <div className="space-y-3 border-t border-slate-200 p-3 dark:border-zinc-700">
                      {DEBUG_CATEGORIES.map((category) => {
                        const enabledValues = DEBUG_VALUES[category.id].filter((value) => debugDraft.values[value.id]).length;
                        return (
                          <div key={category.id} className="space-y-1">
                            <label className="flex items-center gap-2 font-medium text-xs">
                              <input 
                                type="checkbox" 
                                className="h-3.5 w-3.5 rounded accent-blue-600"
                                checked={debugDraft.categories[category.id]} 
                                onChange={(e) => setDebugDraft({ 
                                  ...debugDraft, 
                                  categories: { ...debugDraft.categories, [category.id]: e.target.checked } 
                                })} 
                              />
                              <span>{category.label}</span>
                              <span className="text-[11px] text-slate-500">({enabledValues} / {DEBUG_VALUES[category.id].length})</span>
                            </label>
                            <p className="ml-5 text-[11px] text-slate-500 dark:text-zinc-400">{category.description}</p>
                            <div className="ml-5 grid grid-cols-1 gap-1 sm:grid-cols-2">
                              {DEBUG_VALUES[category.id].map((value) => (
                                <label key={value.id} className="flex items-center gap-1.5 text-[11px]">
                                  <input 
                                    type="checkbox" 
                                    className="h-3 w-3 rounded accent-blue-600"
                                    checked={debugDraft.values[value.id] ?? false} 
                                    onChange={(e) => setDebugDraft({ 
                                      ...debugDraft, 
                                      values: { ...debugDraft.values, [value.id]: e.target.checked } 
                                    })} 
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
                    onClick={() => {
                      const report = { 
                        createdAt: new Date().toISOString(), 
                        settings: debugDraft, 
                        snapshot: useDebugStore.getState().snapshot, 
                        events: useDebugStore.getState().events 
                      };
                      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = `karttasovellus-debug-${new Date().toISOString().slice(0, 10)}.json`;
                      link.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Vie diagnostiikkaraportti (.json)
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40 sm:px-6">
          <button
            type="button"
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow hover:bg-blue-700 transition"
            onClick={() => void close()}
          >
            Sulje ja tallenna
          </button>
        </div>
      </div>
    </div>
  );
}
