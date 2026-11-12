import { Moon, Ruler, Route, Settings, Sun } from "lucide-react";
import { useMapStore, type Tool } from "../../store/mapStore";

export default function AppToolbar() {
  const tool = useMapStore((state) => state.tool);
  const settings = useMapStore((state) => state.settings);
  const overlayOpacityValue = Number(settings.uiOverlayOpacity ?? "1");
  const overlayOpacity = Number.isFinite(overlayOpacityValue) ? Math.min(1, Math.max(0, overlayOpacityValue)) : 1;

  const buttonClass = (active: boolean) =>
    `rounded-lg p-2 shadow-lg transition ${active ? "bg-blue-600 text-white" : "bg-white/95 dark:bg-zinc-950 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-900"}`;
  const toggle = (nextTool: Tool) => useMapStore.setState({ tool: tool === nextTool ? "none" : nextTool });
  const toggleTheme = () => {
    void useMapStore.getState().setSetting("theme", settings.theme === "dark" ? "light" : "dark");
  };

  return (
    <div className="absolute right-2 top-2 z-30 flex max-w-[calc(100vw-0.5rem)] flex-wrap justify-end gap-1 sm:right-3 sm:top-3 sm:gap-2" style={{ opacity: overlayOpacity }}>
      <button className={buttonClass(tool === "measure")} title="Mittaa matka ja korkeusprofiili" onClick={() => toggle("measure")}><Ruler size={18} /></button>
      <button className={`${buttonClass(false)} cursor-not-allowed opacity-40`} title="Reitinhaku (tulossa)" disabled><Route size={18} /></button>
      <button className={buttonClass(false)} title="Asetukset" onClick={() => useMapStore.setState({ settingsOpen: true })}><Settings size={18} /></button>
      <button className={buttonClass(false)} title={settings.theme === "dark" ? "Vaihda vaaleaan teemaan" : "Vaihda tummaan teemaan"} onClick={toggleTheme}>
        {settings.theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </div>
  );
}
