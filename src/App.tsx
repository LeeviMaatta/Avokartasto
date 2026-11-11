import { useEffect } from "react";
import { Eye, Ruler, Route, Settings } from "lucide-react";
import { useMapStore, type Tool } from "./store/mapStore";
import MapContainer from "./components/Map/MapContainer";
import LayerSwitcher from "./components/Map/Controls/LayerSwitcher";
import MeasureTool from "./components/Map/Controls/MeasureTool";
import StreetViewPanel from "./components/Map/Controls/StreetViewPanel";
import InfoBox from "./components/Map/Overlays/InfoBox";
import ElevationChart from "./components/Shared/ElevationChart";
import SettingsModal from "./components/Settings/SettingsModal";

export default function App() {
  const tool = useMapStore((s) => s.tool);
  const theme = useMapStore((s) => s.settings.theme ?? "light");
  const loadAll = useMapStore((s) => s.loadAll);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  const toggle = (t: Tool) => useMapStore.setState({ tool: tool === t ? "none" : t });
  const btn = (active: boolean) =>
    `rounded-lg p-2 shadow-lg transition ${active ? "bg-blue-600 text-white" : "bg-white/95 dark:bg-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700"}`;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-100 dark:bg-gray-900 font-sans select-none">
      <MapContainer />
      <LayerSwitcher />
      <div className="absolute right-3 top-3 z-30 flex gap-2">
        <button className={btn(tool === "measure")} title="Mittaa matka ja korkeusprofiili" onClick={() => toggle("measure")}>
          <Ruler size={18} />
        </button>
        <button className={btn(tool === "streetview")} title="Street View" onClick={() => toggle("streetview")}>
          <Eye size={18} />
        </button>
        <button className={`${btn(false)} cursor-not-allowed opacity-40`} title="Reitinhaku (tulossa)" disabled>
          <Route size={18} />
        </button>
        <button className={btn(false)} title="Asetukset" onClick={() => useMapStore.setState({ settingsOpen: true })}>
          <Settings size={18} />
        </button>
      </div>
      <MeasureTool />
      <StreetViewPanel />
      <ElevationChart />
      <InfoBox />
      <SettingsModal />
    </div>
  );
}