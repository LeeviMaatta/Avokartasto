import { lazy, Suspense, useEffect } from "react";
import { useMapStore } from "../store/mapStore";
import MapContainer from "../features/map/MapContainer";
import LayerSwitcher from "../features/map/controls/LayerSwitcher";
import SearchBar from "../features/map/controls/SearchBar";
import MeasureTool from "../features/map/controls/MeasureTool";
import InfoBox from "../features/map/overlays/InfoBox";
import SettingsModal from "../features/settings/SettingsModal";
import ConfirmDialog from "./ConfirmDialog";
import AppToolbar from "./appToolbar/AppToolbar";
import DebugOverlay from "../features/debug/DebugOverlay";
import { useDebugStore } from "../features/debug/debugStore";

const ElevationChart = lazy(() => import("../features/measurements/ElevationChart"));

export default function App() {
  const loadAll = useMapStore((s) => s.loadAll);
  const persistenceError = useMapStore((s) => s.persistenceError);
  const clearPersistenceError = useMapStore((s) => s.clearPersistenceError);
  const settings = useMapStore((s) => s.settings);
  const loadDebugSettings = useDebugStore((s) => s.load);
  const rawOverlayOpacity = Number(settings.uiOverlayOpacity ?? "1");
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
  }, [settings.theme]);

  useEffect(() => {
    void loadAll().then(() => {
      loadDebugSettings(useMapStore.getState().settings.debugSettings);
    }).catch((error) => {
      console.error("Sovelluksen tietojen lataus epäonnistui", error);
      useMapStore.setState({ persistenceError: "Sovelluksen tietoja ei voitu ladata." });
    });
  }, [loadAll, loadDebugSettings]);

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
      <Suspense fallback={null}>
        <ElevationChart />
      </Suspense>
      <InfoBox />
      <DebugOverlay />
      <SettingsModal />
      <ConfirmDialog />
      {persistenceError && (
        <div className="absolute bottom-3 left-1/2 z-[100] flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-red-700 px-3 py-2 text-xs text-white shadow-lg" style={{ opacity: overlayOpacity }}>
          <span>{persistenceError}</span>
          <button className="font-semibold underline" onClick={clearPersistenceError}>Sulje</button>
        </div>
      )}
    </div>
  );
}