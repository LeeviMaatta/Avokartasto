import { useEffect, useRef } from "react";
import { Moon, Ruler, Route, Settings, Sun } from "lucide-react";
import { useMapStore, type Tool } from "../store/mapStore";
import { focusFirstNavigable, handleContainerArrowKeyDown } from "../shared/keyboardNavigation";

export default function AppToolbar() {
  const containerRef = useRef<HTMLDivElement>(null);
  const tool = useMapStore((state) => state.tool);
  const theme = useMapStore((state) => state.settings.theme);
  const overlayOpacityValue = Number(useMapStore((state) => state.settings.uiOverlayOpacity ?? "1"));
  const overlayOpacity = Number.isFinite(overlayOpacityValue) ? Math.min(1, Math.max(0, overlayOpacityValue)) : 1;

  useEffect(() => {
    const onFocusToolbar = () => {
      focusFirstNavigable(containerRef.current);
    };
    window.addEventListener("kb-focus-toolbar", onFocusToolbar);
    return () => window.removeEventListener("kb-focus-toolbar", onFocusToolbar);
  }, []);

  const buttonClass = (active: boolean) =>
    `rounded-xl p-2.5 shadow-lg backdrop-blur-md border transition ${
      active 
        ? "bg-blue-600 border-blue-500 text-white shadow-blue-500/20" 
        : "border-slate-200/80 bg-white/95 text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-white"
    }`;
  const toggle = (nextTool: Tool) => useMapStore.getState().toggleTool(nextTool);
  const toggleTheme = () => {
    void useMapStore.getState().setSetting("theme", theme === "dark" ? "light" : "dark");
  };

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Päätyökalupalkki"
      onKeyDown={(e) => handleContainerArrowKeyDown(e, { orientation: "horizontal" })}
      className="absolute right-2 top-2 z-30 flex max-w-[calc(100vw-0.5rem)] flex-wrap justify-end gap-1 sm:right-3 sm:top-3 sm:gap-2"
      style={{ opacity: overlayOpacity }}
    >
      <button className={buttonClass(tool === "measure")} title="Mittaa matka ja korkeusprofiili" aria-label="Mittaa matka ja korkeusprofiili" onClick={() => toggle("measure")}><Ruler size={18} /></button>
      <button className={buttonClass(tool === "route")} title="Reitinhaku ja reittiohjeet" aria-label="Reitinhaku ja reittiohjeet" onClick={() => toggle("route")}><Route size={18} /></button>
      <button className={buttonClass(false)} title="Asetukset" aria-label="Asetukset" onClick={() => useMapStore.setState({ settingsOpen: true })}><Settings size={18} /></button>
      <button className={buttonClass(false)} title={theme === "dark" ? "Vaihda vaaleaan teemaan" : "Vaihda tummaan teemaan"} aria-label={theme === "dark" ? "Vaihda vaaleaan teemaan" : "Vaihda tummaan teemaan"} onClick={toggleTheme}>
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </div>
  );
}
