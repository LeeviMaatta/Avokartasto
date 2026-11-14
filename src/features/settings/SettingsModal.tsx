import { useEffect, useRef, useState } from "react";
import { 
  X, 
  ChevronDown, 
  ChevronRight, 
  Palette, 
  Map as MapIcon, 
  Compass, 
  Ruler, 
  MapPin,
  KeyRound, 
  Keyboard,
  RotateCcw,
  Bug, 
  Check 
} from "lucide-react";
import { useMapStore } from "../../store/mapStore";
import { SETTING_KEYS, SETTING_TOGGLES, SETTING_VALUE_KEYS } from "./model/settingFields";
import { parseOpenSections } from "./model/persistedUiState";
import {
  DEFAULT_ARROW_ZOOM_KEY,
  DEFAULT_ROTATION_KEY,
  DEFAULT_SHORTCUTS,
  SHORTCUT_CATEGORIES,
  SHORTCUT_DEFINITIONS,
  findShortcutConflicts,
  formatRotationKeyLabel,
  formatShortcutLabel,
  getModifiersFromEvent,
  isModifierKey,
  normalizeRotationKeyString,
  normalizeShortcutFromEvent,
  normalizeSingleKey,
  parseShortcuts,
  type ShortcutActionId,
} from "./model/keyboardShortcuts";
import {
  focusFirstNavigable,
  focusMapViewport,
  handleContainerArrowKeyDown,
} from "../../shared/keyboardNavigation";
import {
  BACKDROP_MAX_ZOOM,
  abortBackdropPreload,
  getBackdropCacheStatus,
  preloadBackdropLayer,
  subscribeBackdropCacheStatus,
  type BackdropCacheStatus,
} from "../map/sources/backdropCache";
import { requiredSecrets } from "../map/sources/resolveUrl";

const DEFAULT_OPEN_SECTIONS: Record<string, boolean> = {
  theme: true,
  map: true,
  coords: false,
  measure: false,
  colors: false,
  keyboard: false,
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
  const { settingsOpen, settings, setSettings, sources, centerCoord } = useMapStore();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [debugDraft, setDebugDraft] = useState<DebugSettings>(DEFAULT_DEBUG_SETTINGS);
  const [debugDataOpen, setDebugDataOpen] = useState(false);
  const [savedInitialView, setSavedInitialView] = useState(false);
  const [capturingAction, setCapturingAction] = useState<ShortcutActionId | null>(null);
  const [capturingModifierSetting, setCapturingModifierSetting] = useState<"rotationKey" | "arrowZoomKey" | null>(null);
  const [backdropStatus, setBackdropStatus] = useState<BackdropCacheStatus>(() => getBackdropCacheStatus());
  const dialogRef = useRef<HTMLDivElement>(null);
  
  // Accordion sections
  const openSections = parseOpenSections(settings.settingsOpenSections, DEFAULT_OPEN_SECTIONS);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const debugDraftRef = useRef(debugDraft);
  debugDraftRef.current = debugDraft;
  const capturingActionRef = useRef(capturingAction);
  capturingActionRef.current = capturingAction;
  const capturingModifierSettingRef = useRef(capturingModifierSetting);
  capturingModifierSettingRef.current = capturingModifierSetting;

  useEffect(() => subscribeBackdropCacheStatus(setBackdropStatus), []);

  useEffect(() => {
    if (settingsOpen) {
      setDraft(settings);
      setDebugDraft(parseDebugSettings(settings.debugSettings));
      setDebugDataOpen(false);
      setSavedInitialView(false);
      setCapturingAction(null);
      setCapturingModifierSetting(null);
    } else {
      setCapturingAction(null);
      setCapturingModifierSetting(null);
    }
  }, [settingsOpen, settings]);

  useEffect(() => {
    if (settingsOpen) {
      requestAnimationFrame(() => focusFirstNavigable(dialogRef.current));
    }
  }, [settingsOpen]);

  useEffect(() => {
    if (!capturingAction) return;
    const handleCapture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setCapturingAction(null);
        return;
      }
      const combo = normalizeShortcutFromEvent(event);
      if (!combo) return;
      setDraft((prev) => {
        const current = parseShortcuts(prev.keyboardShortcuts);
        return {
          ...prev,
          keyboardShortcuts: JSON.stringify({ ...current, [capturingAction]: combo }),
        };
      });
      setCapturingAction(null);
    };
    window.addEventListener("keydown", handleCapture, true);
    return () => window.removeEventListener("keydown", handleCapture, true);
  }, [capturingAction]);

  useEffect(() => {
    if (!capturingModifierSetting) return;
    let pendingModifiers = "";
    let completed = false;

    const finishCapture = (combo: string) => {
      if (completed || !combo) return;
      completed = true;
      setDraft((prev) => ({ ...prev, [capturingModifierSetting]: combo }));
      setCapturingModifierSetting(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (completed) return;
      if (event.key === "Escape") {
        completed = true;
        setCapturingModifierSetting(null);
        return;
      }
      if (isModifierKey(event.key)) {
        const mods = getModifiersFromEvent(event);
        if (mods.length > 0) {
          pendingModifiers = normalizeRotationKeyString(mods.join("+"));
        }
        return;
      }
      const key = normalizeSingleKey(event.key, event.code);
      const combo = normalizeRotationKeyString([...getModifiersFromEvent(event), key].join("+"));
      if (combo) {
        finishCapture(combo);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (completed) return;
      if (isModifierKey(event.key) && pendingModifiers) {
        event.preventDefault();
        event.stopPropagation();
        finishCapture(pendingModifiers);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [capturingModifierSetting]);

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
    });
    useDebugStore.setState({ settings: currentDebug });
    useMapStore.setState({ settingsOpen: false });
    requestAnimationFrame(() => focusMapViewport());
  };

  // Close on Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !capturingActionRef.current && !capturingModifierSettingRef.current) {
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

  const parsedShortcuts = parseShortcuts(draft.keyboardShortcuts);
  const shortcutConflicts = findShortcutConflicts(parsedShortcuts);

  const updateShortcut = (action: ShortcutActionId, value: string) => {
    setDraft((prev) => {
      const current = parseShortcuts(prev.keyboardShortcuts);
      return {
        ...prev,
        keyboardShortcuts: JSON.stringify({ ...current, [action]: value }),
      };
    });
  };

  const resetAllShortcuts = () => {
    setCapturingAction(null);
    setCapturingModifierSetting(null);
    setDraft((prev) => ({
      ...prev,
      keyboardShortcuts: JSON.stringify({ ...DEFAULT_SHORTCUTS }),
      rotationKey: DEFAULT_ROTATION_KEY,
      arrowZoomKey: DEFAULT_ARROW_ZOOM_KEY,
    }));
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 backdrop-blur-xs transition-opacity sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) void close();
      }}
    >
      <div 
        ref={dialogRef}
        className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-[680px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 shadow-2xl transition-all dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-heading"
        onKeyDown={(e) => {
          if (capturingAction || capturingModifierSetting) return;
          handleContainerArrowKeyDown(e, {
            onEscape: () => void close(),
          });
        }}
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

                {(() => {
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
                    <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-2">
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
                            {backdropStatus.loading && statusMatchesSelected
                              ? "Ladataan..."
                              : "Lataa nykyinen alue"}
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
                })()}
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

                <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-zinc-800">
                  <label className="flex items-center gap-2.5 cursor-pointer">
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
                          className="mt-2 w-full accent-blue-600 cursor-pointer"
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
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded accent-blue-600"
                            checked={draft.hideSegmentLengthsByZoom !== "0"}
                            onChange={(e) => setDraft({ ...draft, hideSegmentLengthsByZoom: e.target.checked ? "1" : "0" })}
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
                              className="mt-1.5 w-full accent-blue-600 cursor-pointer"
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

                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.enableTerrainRouting !== "0"}
                      onChange={(e) => setDraft({ ...draft, enableTerrainRouting: e.target.checked ? "1" : "0" })}
                    />
                    <span>Näytä maastoreittitoiminto etäisyysmittauksessa (kokeellinen)</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Merkkien & mittausten värit */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 transition-colors dark:border-zinc-800 dark:bg-zinc-900/40">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-800 dark:text-zinc-200"
              onClick={() => toggleSection("colors")}
              aria-expanded={openSections.colors}
            >
              <div className="flex items-center gap-2">
                <MapPin size={18} className="text-blue-600 dark:text-blue-400" />
                <span>Merkkien & Mittausten Värit</span>
              </div>
              {openSections.colors ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            {openSections.colors && (
              <div className="space-y-4 border-t border-slate-200 p-4 dark:border-zinc-800">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {[
                    {
                      heading: "Merkit",
                      items: [
                        ["savedMarkerColor", "Tallennettujen merkkien väri", "#dc2626"],
                        ["unsavedMarkerColor", "Tallentamattoman merkin väri", "#f97316"],
                      ] as const,
                    },
                    {
                      heading: "Mittaukset",
                      items: [
                        ["savedMeasurementColor", "Tallennettujen mittausten väri", "#16a34a"],
                        ["unsavedMeasurementColor", "Tallentamattoman mittauksen väri", "#2563eb"],
                      ] as const,
                    },
                  ].map((group) => (
                    <div key={group.heading} className="space-y-3 rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                      <div className="text-xs font-semibold text-slate-700 dark:text-zinc-300">{group.heading}</div>
                      {group.items.map(([key, label, fallback]) => {
                        const value = draft[key] || fallback;
                        return (
                          <label key={key} className="block">
                            <span className="text-xs font-medium text-slate-600 dark:text-zinc-400">{label}</span>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                type="color"
                                className="h-8 w-12 cursor-pointer rounded border border-slate-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                                value={value}
                                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                              />
                              <span className="font-mono text-xs">{value}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        savedMarkerColor: "#dc2626",
                        unsavedMarkerColor: "#f97316",
                        savedMeasurementColor: "#16a34a",
                        unsavedMeasurementColor: "#2563eb",
                      })
                    }
                  >
                    Palauta oletusvärit
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section: Näppäimistö & Pikanäppäimet */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 transition-colors dark:border-zinc-800 dark:bg-zinc-900/40">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 font-semibold text-slate-800 dark:text-zinc-200"
              onClick={() => toggleSection("keyboard")}
              aria-expanded={openSections.keyboard}
            >
              <div className="flex items-center gap-2">
                <Keyboard size={18} className="text-blue-600 dark:text-blue-400" />
                <span>Näppäimistö &amp; Pikanäppäimet</span>
              </div>
              {openSections.keyboard ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            {openSections.keyboard && (
              <div className="space-y-4 border-t border-slate-200 p-4 dark:border-zinc-800">
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
                  <div>
                    <div className="font-medium text-slate-800 dark:text-zinc-200">
                      Pikanäppäimet käytössä
                    </div>
                    <div className="text-xs text-slate-500 dark:text-zinc-400">
                      Nuolinäppäimet liikkuvat valikoissa ja siirtävät karttaa, kun kartta on valittuna. Esc palauttaa kartalle.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-600"
                    checked={draft.keyboardShortcutsEnabled !== "0"}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        keyboardShortcutsEnabled: e.target.checked ? "1" : "0",
                      }))
                    }
                  />
                </label>

                {(() => {
                  const rotationEnabled = draft.enableRotation !== "0";
                  const capturingRotationKey = capturingModifierSetting === "rotationKey";
                  const currentRotationKey =
                    normalizeRotationKeyString(draft.rotationKey || DEFAULT_ROTATION_KEY) || DEFAULT_ROTATION_KEY;
                  const isCustomized = currentRotationKey !== DEFAULT_ROTATION_KEY;
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
                      <label className="flex flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded accent-blue-600"
                          checked={rotationEnabled}
                          onChange={(e) => {
                            if (!e.target.checked && capturingRotationKey) setCapturingModifierSetting(null);
                            setDraft((prev) => ({ ...prev, enableRotation: e.target.checked ? "1" : "0" }));
                          }}
                        />
                        <div>
                          <div className="font-medium text-slate-800 dark:text-zinc-200">
                            Salli kartan kierto
                          </div>
                          <div className="text-xs text-slate-500 dark:text-zinc-400">
                            Oletus: {formatRotationKeyLabel(DEFAULT_ROTATION_KEY)} + veto
                          </div>
                        </div>
                      </label>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          disabled={!rotationEnabled}
                          data-shortcut-capturing={capturingRotationKey ? "true" : undefined}
                          onClick={() => {
                            setCapturingAction(null);
                            setCapturingModifierSetting(capturingRotationKey ? null : "rotationKey");
                          }}
                          className={`min-w-[124px] rounded-md border px-2.5 py-1 text-center text-xs font-mono transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            capturingRotationKey
                              ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/30 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-300"
                              : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          }`}
                          title="Klikkaa tai paina Enter määrittääksesi kiertonäppäimen (Esc peruuttaa)"
                        >
                          {capturingRotationKey
                            ? "Paina näppäintä..."
                            : `${formatRotationKeyLabel(currentRotationKey)} + veto`}
                        </button>
                        {isCustomized && (
                          <button
                            type="button"
                            disabled={!rotationEnabled}
                            onClick={() => {
                              if (capturingRotationKey) setCapturingModifierSetting(null);
                              setDraft((prev) => ({ ...prev, rotationKey: DEFAULT_ROTATION_KEY }));
                            }}
                            className="rounded-md border border-slate-200 p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            title="Palauta oletuskiertonäppäin"
                            aria-label="Palauta oletuskiertonäppäin"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {(() => {
                  const capturingArrowZoomKey = capturingModifierSetting === "arrowZoomKey";
                  const currentArrowZoomKey =
                    normalizeRotationKeyString(draft.arrowZoomKey || DEFAULT_ARROW_ZOOM_KEY) || DEFAULT_ARROW_ZOOM_KEY;
                  const isCustomized = currentArrowZoomKey !== DEFAULT_ARROW_ZOOM_KEY;
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-800 dark:text-zinc-200">
                          Zoomaus nuolinäppäimillä
                        </div>
                        <div className="text-xs text-slate-500 dark:text-zinc-400">
                          Oletus: {formatRotationKeyLabel(DEFAULT_ARROW_ZOOM_KEY)} + ↑ / ↓
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          data-shortcut-capturing={capturingArrowZoomKey ? "true" : undefined}
                          onClick={() => {
                            setCapturingAction(null);
                            setCapturingModifierSetting(capturingArrowZoomKey ? null : "arrowZoomKey");
                          }}
                          className={`min-w-[124px] rounded-md border px-2.5 py-1 text-center text-xs font-mono transition ${
                            capturingArrowZoomKey
                              ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/30 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-300"
                              : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          }`}
                          title="Klikkaa tai paina Enter määrittääksesi nuolizoomauksen pikanäppäimen (Esc peruuttaa)"
                        >
                          {capturingArrowZoomKey
                            ? "Paina näppäintä..."
                            : `${formatRotationKeyLabel(currentArrowZoomKey)} + ↑ / ↓`}
                        </button>
                        {isCustomized && (
                          <button
                            type="button"
                            onClick={() => {
                              if (capturingArrowZoomKey) setCapturingModifierSetting(null);
                              setDraft((prev) => ({ ...prev, arrowZoomKey: DEFAULT_ARROW_ZOOM_KEY }));
                            }}
                            className="rounded-md border border-slate-200 p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                            title="Palauta oletusnäppäin nuolizoomaukselle"
                            aria-label="Palauta oletusnäppäin nuolizoomaukselle"
                          >
                            <RotateCcw size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.enableDoubleClickZoom === "1"}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, enableDoubleClickZoom: e.target.checked ? "1" : "0" }))
                      }
                    />
                    <span className="text-xs font-medium text-slate-800 dark:text-zinc-200">Zoomaa kaksoisklikkauksella</span>
                  </label>

                  <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded accent-blue-600"
                      checked={draft.removePendingMarkerOnDblClick !== "0"}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          removePendingMarkerOnDblClick: e.target.checked ? "1" : "0",
                        }))
                      }
                    />
                    <span className="text-xs font-medium text-slate-800 dark:text-zinc-200">Poista merkki tai lopeta muokkaus kaksoisklikkauksella</span>
                  </label>
                </div>

                {shortcutConflicts.size > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
                    Huomio: sama pikanäppäin on määritetty useammalle toiminnolle. Korjaa korostetut rivit, jos haluat välttää päällekkäisyydet.
                  </div>
                )}

                <div className="space-y-4">
                  {SHORTCUT_CATEGORIES.map((category) => {
                    const defs = SHORTCUT_DEFINITIONS.filter((d) => d.category === category.id);
                    return (
                      <div key={category.id} className="space-y-1.5">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
                          {category.label}
                        </div>
                        <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
                          {defs.map((def) => {
                            const currentCombo = parsedShortcuts[def.id] ?? "";
                            const isCapturing = capturingAction === def.id;
                            const hasConflict = shortcutConflicts.has(def.id);
                            return (
                              <div
                                key={def.id}
                                data-kb-row="true"
                                className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${
                                  hasConflict ? "bg-amber-50/70 dark:bg-amber-950/20" : ""
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 text-xs font-medium text-slate-800 dark:text-zinc-200">
                                    <span>{def.label}</span>
                                    {hasConflict && (
                                      <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                                        Päällekkäinen
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                                    Oletus: {formatShortcutLabel(def.defaultKey)}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  <button
                                    type="button"
                                    data-shortcut-capturing={isCapturing ? "true" : undefined}
                                    onClick={() => {
                                      setCapturingModifierSetting(null);
                                      setCapturingAction(isCapturing ? null : def.id);
                                    }}
                                    className={`min-w-[92px] rounded-md border px-2.5 py-1 text-center text-xs font-mono transition ${
                                      isCapturing
                                        ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/30 dark:border-blue-400 dark:bg-blue-950/60 dark:text-blue-300"
                                        : hasConflict
                                          ? "border-amber-400 bg-white text-amber-800 hover:bg-amber-50 dark:border-amber-600 dark:bg-zinc-900 dark:text-amber-300"
                                          : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                    }`}
                                    title="Klikkaa tai paina Enter määrittääksesi pikanäppäimen (Esc peruuttaa)"
                                  >
                                    {isCapturing
                                      ? "Paina näppäintä..."
                                      : currentCombo
                                        ? formatShortcutLabel(currentCombo)
                                        : "Ei asetettu"}
                                  </button>
                                  {currentCombo && (
                                    <button
                                      type="button"
                                      onClick={() => updateShortcut(def.id, "")}
                                      className="rounded-md border border-slate-200 p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:border-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                                      title={`Tyhjennä pikanäppäin (${def.label})`}
                                      aria-label={`Tyhjennä pikanäppäin: ${def.label}`}
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Vinkki: Valikot toimivat myös nuolinäppäimillä, <kbd className="rounded border border-slate-300 px-1 dark:border-zinc-700">Enter</kbd> valitsee ja <kbd className="rounded border border-slate-300 px-1 dark:border-zinc-700">Esc</kbd> palaa kartalle.
                  </div>
                  <button
                    type="button"
                    onClick={resetAllShortcuts}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <RotateCcw size={13} />
                    <span>Palauta oletuspikanäppäimet</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 6: API-avaimet */}
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

                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded accent-blue-600"
                    checked={debugDraft.showTileBoundaries}
                    onChange={(e) => setDebugDraft({ ...debugDraft, showTileBoundaries: e.target.checked })}
                  />
                  <span>Näytä tiilien rajat kartalla (graafinen ruudukko)</span>
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
                      link.download = `avokartasto-debug-${new Date().toISOString().slice(0, 10)}.json`;
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
