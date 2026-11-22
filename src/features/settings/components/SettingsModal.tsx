import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bug,
  Compass,
  Keyboard,
  KeyRound,
  Map as MapIcon,
  MapPin,
  Palette,
  Ruler,
  X,
} from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { SETTING_KEYS, SETTING_TOGGLES, SETTING_VALUE_KEYS } from "../model/settingFields";
import { parseOpenSections } from "../hooks/persistedUiState";
import { useShortcutCapture } from "../hooks/useShortcutCapture";
import {
  focusFirstNavigable,
  focusMapViewport,
  handleContainerArrowKeyDown,
} from "../../../shared/keyboardNavigation";
import {
  getBackdropCacheStatus,
  subscribeBackdropCacheStatus,
  type BackdropCacheStatus,
} from "../../map/services/backdropCache";
import { useDebugStore } from "../../debug/model/debugStore";
import {
  DEFAULT_DEBUG_SETTINGS,
  parseDebugSettings,
  type DebugSettings,
} from "../../debug/model/debugTypes";
import { SettingsAccordionSection } from "./SettingsAccordionSection";
import { ThemeSection } from "./sections/ThemeSection";
import { MapSection } from "./sections/MapSection";
import { CoordsSection } from "./sections/CoordsSection";
import { MeasureSection } from "./sections/MeasureSection";
import { ColorsSection } from "./sections/ColorsSection";
import { KeyboardSection } from "./sections/KeyboardSection";
import { ApiKeysSection } from "./sections/ApiKeysSection";
import { DebugSection } from "./sections/DebugSection";

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

export default function SettingsModal() {
  const { settingsOpen, settings, setSettings, sources, centerCoord } = useMapStore();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [debugDraft, setDebugDraft] = useState<DebugSettings>(DEFAULT_DEBUG_SETTINGS);
  const [debugDataOpen, setDebugDataOpen] = useState(false);
  const [savedInitialView, setSavedInitialView] = useState(false);
  const [backdropStatus, setBackdropStatus] = useState<BackdropCacheStatus>(() =>
    getBackdropCacheStatus(),
  );
  const dialogRef = useRef<HTMLDivElement>(null);

  const openSections = parseOpenSections(settings.settingsOpenSections, DEFAULT_OPEN_SECTIONS);

  const draftRef = useRef(draft);
  draftRef.current = draft;
  const debugDraftRef = useRef(debugDraft);
  debugDraftRef.current = debugDraft;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const {
    capturingAction,
    setCapturingAction,
    capturingModifierSetting,
    setCapturingModifierSetting,
    capturingActionRef,
    capturingModifierSettingRef,
    clearCapture,
  } = useShortcutCapture({ settingsOpen, setDraft });

  useEffect(() => subscribeBackdropCacheStatus(setBackdropStatus), []);

  useEffect(() => {
    if (settingsOpen) {
      setDraft(settings);
      setDebugDraft(parseDebugSettings(settings.debugSettings));
      setDebugDataOpen(false);
      setSavedInitialView(false);
    }
    clearCapture();
  }, [settingsOpen, settings]);

  useEffect(() => {
    if (settingsOpen) {
      requestAnimationFrame(() => focusFirstNavigable(dialogRef.current));
    }
  }, [settingsOpen]);

  const toggleSection = (key: string) => {
    const next = { ...openSections, [key]: !openSections[key] };
    void useMapStore.getState().setSetting("settingsOpenSections", JSON.stringify(next));
  };

  const close = useCallback(async () => {
    const currentDraft = draftRef.current;
    const currentDebug = debugDraftRef.current;
    const values = Object.fromEntries(
      [...SETTING_KEYS.map(([k]) => k), ...SETTING_TOGGLES.map(([k]) => k), ...SETTING_VALUE_KEYS]
        .map((key) => [key, (currentDraft[key] ?? "").trim()]),
    );
    await setSettings({
      ...settingsRef.current,
      ...values,
      initialMapCenter: currentDraft.initialMapCenter ?? "",
      initialMapZoom: currentDraft.initialMapZoom ?? "",
      debugSettings: JSON.stringify(currentDebug),
    });
    useDebugStore.setState({ settings: currentDebug });
    useMapStore.setState({ settingsOpen: false });
    requestAnimationFrame(() => focusMapViewport());
  }, [setSettings]);

  useEffect(() => {
    if (!settingsOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !capturingActionRef.current &&
        !capturingModifierSettingRef.current
      ) {
        void close();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [settingsOpen, close, capturingActionRef, capturingModifierSettingRef]);

  const handleSaveInitialView = () => {
    const currentCoord = useMapStore.getState().centerCoord;
    const currentSettings = useMapStore.getState().settings;
    if (!currentCoord) return;
    setDraft((prev) => ({
      ...prev,
      initialMapCenter: JSON.stringify(currentCoord),
      initialMapZoom: currentSettings.lastMapZoom || "10",
    }));
    setSavedInitialView(true);
    setTimeout(() => setSavedInitialView(false), 2500);
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
        ref={dialogRef}
        className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-[680px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm text-slate-800 shadow-2xl transition-all dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-heading"
        onKeyDown={(e) => {
          if (capturingAction || capturingModifierSetting) return;
          handleContainerArrowKeyDown(e, { onEscape: () => void close() });
        }}
      >
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

        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
          <SettingsAccordionSection
            title="Ulkoasu & Teema"
            icon={<Palette size={18} className="text-blue-600 dark:text-blue-400" />}
            isOpen={Boolean(openSections.theme)}
            onToggle={() => toggleSection("theme")}
          >
            <ThemeSection draft={draft} setDraft={setDraft} />
          </SettingsAccordionSection>

          <SettingsAccordionSection
            title="Karttanäkymä & Säätimet"
            icon={<MapIcon size={18} className="text-blue-600 dark:text-blue-400" />}
            isOpen={Boolean(openSections.map)}
            onToggle={() => toggleSection("map")}
          >
            <MapSection
              draft={draft}
              setDraft={setDraft}
              savedInitialView={savedInitialView}
              onSaveInitialView={handleSaveInitialView}
              onClearInitialView={handleClearInitialView}
              sources={sources}
              centerCoord={centerCoord}
              backdropStatus={backdropStatus}
            />
          </SettingsAccordionSection>

          <SettingsAccordionSection
            title="Koordinaatit & Tietolaatikko"
            icon={<Compass size={18} className="text-blue-600 dark:text-blue-400" />}
            isOpen={Boolean(openSections.coords)}
            onToggle={() => toggleSection("coords")}
          >
            <CoordsSection draft={draft} setDraft={setDraft} />
          </SettingsAccordionSection>

          <SettingsAccordionSection
            title="Mittaus & Yksiköt"
            icon={<Ruler size={18} className="text-blue-600 dark:text-blue-400" />}
            isOpen={Boolean(openSections.measure)}
            onToggle={() => toggleSection("measure")}
          >
            <MeasureSection draft={draft} setDraft={setDraft} />
          </SettingsAccordionSection>

          <SettingsAccordionSection
            title="Merkkien & Mittausten Värit"
            icon={<MapPin size={18} className="text-blue-600 dark:text-blue-400" />}
            isOpen={Boolean(openSections.colors)}
            onToggle={() => toggleSection("colors")}
          >
            <ColorsSection draft={draft} setDraft={setDraft} />
          </SettingsAccordionSection>

          <SettingsAccordionSection
            title="Näppäimistö & Pikanäppäimet"
            icon={<Keyboard size={18} className="text-blue-600 dark:text-blue-400" />}
            isOpen={Boolean(openSections.keyboard)}
            onToggle={() => toggleSection("keyboard")}
          >
            <KeyboardSection
              draft={draft}
              setDraft={setDraft}
              capturingAction={capturingAction}
              setCapturingAction={setCapturingAction}
              capturingModifierSetting={capturingModifierSetting}
              setCapturingModifierSetting={setCapturingModifierSetting}
            />
          </SettingsAccordionSection>

          <SettingsAccordionSection
            title="API-avaimet"
            icon={<KeyRound size={18} className="text-blue-600 dark:text-blue-400" />}
            isOpen={Boolean(openSections.api)}
            onToggle={() => toggleSection("api")}
          >
            <ApiKeysSection draft={draft} setDraft={setDraft} />
          </SettingsAccordionSection>

          <SettingsAccordionSection
            title="Diagnostiikka & Debug"
            icon={<Bug size={18} className="text-blue-600 dark:text-blue-400" />}
            isOpen={Boolean(openSections.debug)}
            onToggle={() => toggleSection("debug")}
          >
            <DebugSection
              debugDraft={debugDraft}
              setDebugDraft={setDebugDraft}
              debugDataOpen={debugDataOpen}
              setDebugDataOpen={setDebugDataOpen}
            />
          </SettingsAccordionSection>
        </div>

        <div className="flex items-center justify-end border-t border-slate-200 bg-slate-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40 sm:px-6">
          <button
            type="button"
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow transition hover:bg-blue-700"
            onClick={() => void close()}
          >
            Sulje ja tallenna
          </button>
        </div>
      </div>
    </div>
  );
}
