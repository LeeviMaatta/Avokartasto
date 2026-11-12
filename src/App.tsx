import { useEffect } from "react";
import { Ruler, Route, Settings } from "lucide-react";
import { useMapStore, type Tool } from "./store/mapStore";
import MapContainer from "./components/Map/MapContainer";
import LayerSwitcher from "./components/Map/Controls/LayerSwitcher";
import MeasureTool from "./components/Map/Controls/MeasureTool";
import InfoBox from "./components/Map/Overlays/InfoBox";
import ElevationChart from "./components/Shared/ElevationChart";
import SettingsModal from "./components/Settings/SettingsModal";

export default function App() {
  const tool = useMapStore((s) => s.tool);
  const loadAll = useMapStore((s) => s.loadAll);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const preventBrowserContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("input, textarea, select")) event.preventDefault();
    };
    document.addEventListener("contextmenu", preventBrowserContextMenu);
    return () => document.removeEventListener("contextmenu", preventBrowserContextMenu);
  }, []);

  const toggle = (t: Tool) => useMapStore.setState({ tool: tool === t ? "none" : t });
  const btn = (active: boolean) =>
    `rounded-lg p-2 shadow-lg transition ${active ? "bg-blue-600 text-white" : "bg-white/95 dark:bg-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"}`;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#eef3f7] font-sans select-none">
      <MapContainer />
      <LayerSwitcher />
      <div className="absolute right-2 top-2 z-30 flex max-w-[calc(100vw-0.5rem)] flex-wrap justify-end gap-1 sm:right-3 sm:top-3 sm:gap-2">
        <button className={btn(tool === "measure")} title="Mittaa matka ja korkeusprofiili" onClick={() => toggle("measure")}>
          <Ruler size={18} />
        </button>
        <button className={`${btn(false)} cursor-not-allowed opacity-40`} title="Reitinhaku (tulossa)" disabled>
          <Route size={18} />
        </button>
        <button className={btn(false)} title="Asetukset" onClick={() => useMapStore.setState({ settingsOpen: true })}>
          <Settings size={18} />
        </button>
      </div>
      <MeasureTool />
      <ElevationChart />
      <InfoBox />
      <SettingsModal />
    </div>
  );
}