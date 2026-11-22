import { lazy, Suspense, useEffect, useState } from "react";
import { useMapStore } from "../store/mapStore";
import MapContainer from "../features/map/components/MapContainer";
import LayerSwitcher from "../features/layers/components/LayerSwitcher";
import SearchBar from "../features/search/components/SearchBar";
import CopernicusControls from "../features/map/components/CopernicusControls";
import MeasureTool from "../features/measurements/components/MeasureTool";
import RouteTool from "../features/routing/components/RouteTool";
import InfoBox from "../features/map/components/InfoBox";
import SettingsModal from "../features/settings/components/SettingsModal";
import ConfirmDialog from "./ConfirmDialog";
import AppToolbar from "./AppToolbar";
import DebugOverlay from "../features/debug/components/DebugOverlay";
import { useDebugStore } from "../features/debug/model/debugStore";
import LoadingScreen from "./LoadingScreen";
import { useGlobalKeyboardShortcuts } from "./useGlobalKeyboardShortcuts";
import { focusMapViewport } from "../shared/keyboardNavigation";
import { attachMapFocusRestoration } from "../shared/mapFocus";
import type { UiStyle } from "../features/settings/model/settingTypes";

const ElevationChart = lazy(() => import("../features/measurements/components/ElevationChart"));

export default function App() {
  useGlobalKeyboardShortcuts();
  const loadAll = useMapStore((s) => s.loadAll);
  const persistenceError = useMapStore((s) => s.persistenceError);
  const clearPersistenceError = useMapStore((s) => s.clearPersistenceError);
  const theme = useMapStore((s) => s.settings.theme);
  const rawUiStyle = useMapStore((s) => s.settings.uiStyle);
  const uiStyle: UiStyle = rawUiStyle === "classic" || rawUiStyle === "retro" ? rawUiStyle : "modern";
  const uiScale = Number(useMapStore((s) => s.settings.uiScale ?? "1"));
  const showZoomControls = useMapStore((s) => s.settings.showZoomControls !== "0");
  const darkMapTiles = useMapStore((s) => s.settings.darkMapTiles === "1");
  const rawOverlayOpacity = Number(useMapStore((s) => s.settings.uiOverlayOpacity ?? "1"));
  const loadDebugSettings = useDebugStore((s) => s.load);
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;
  const [appLoading, setAppLoading] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.uiStyle = uiStyle;
  }, [uiStyle]);

  useEffect(() => {
    const scale = Number.isFinite(uiScale) && uiScale >= 0.75 && uiScale <= 1.4 ? uiScale : 1;
    document.documentElement.style.fontSize = `${scale * 100}%`;
  }, [uiScale]);

  useEffect(() => {
    document.documentElement.dataset.hideZoom = (!showZoomControls).toString();
  }, [showZoomControls]);

  useEffect(() => {
    document.documentElement.dataset.darkMapTiles = (darkMapTiles && theme === "dark").toString();
  }, [darkMapTiles, theme]);

  useEffect(() => {
    void loadAll().then(() => {
      loadDebugSettings(useMapStore.getState().settings.debugSettings);
      setAppLoading(false);
    }).catch((error) => {
      console.error("Sovelluksen tietojen lataus epäonnistui", error);
      useMapStore.setState({ persistenceError: "Sovelluksen tietoja ei voitu ladata." });
      setAppLoading(false);
    });
  }, [loadAll, loadDebugSettings]);

  useEffect(() => attachMapFocusRestoration(), []);

  useEffect(() => {
    if (appLoading) return;
    if (document.querySelector('[aria-modal="true"]')) return;
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) {
      focusMapViewport();
    }
  }, [appLoading]);

  useEffect(() => {
    const preventBrowserContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("input, textarea, select")) event.preventDefault();
    };
    document.addEventListener("contextmenu", preventBrowserContextMenu);
    return () => document.removeEventListener("contextmenu", preventBrowserContextMenu);
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#eef3f7] font-sans select-none dark:bg-black">
      <MapContainer />
      <LayerSwitcher />
      <SearchBar />
      <AppToolbar />
      <MeasureTool />
      <RouteTool />
      <CopernicusControls />
      <Suspense fallback={null}>
        <ElevationChart />
      </Suspense>
      <InfoBox />
      <DebugOverlay />
      <SettingsModal />
      <ConfirmDialog />
      <LoadingScreen loading={appLoading} uiStyle={uiStyle} theme={theme} />
      {persistenceError && (
        <div className="absolute bottom-3 left-1/2 z-[100] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-red-700 px-3 py-2 text-xs text-white shadow-lg" style={{ opacity: overlayOpacity }}>
          <span>{persistenceError}</span>
          <button className="font-semibold underline" onClick={clearPersistenceError}>Sulje</button>
        </div>
      )}
    </div>
  );
}