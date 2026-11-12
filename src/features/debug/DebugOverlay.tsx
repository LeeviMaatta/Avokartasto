import { useEffect, useState } from "react";
import { X, Minus, Maximize2, Activity } from "lucide-react";
import { refreshDebugSnapshot, startPerformanceMonitor, stopPerformanceMonitor } from "./debugMonitor";
import { useDebugStore } from "./debugStore";
import { DEBUG_CATEGORIES, DEBUG_VALUES } from "./model/debugTypes";
import { useMapStore } from "../../store/mapStore";

export default function DebugOverlay() {
  const settings = useDebugStore((state) => state.settings);
  const snapshot = useDebugStore((state) => state.snapshot);
  const events = useDebugStore((state) => state.events);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (!settings.enabled) {
      stopPerformanceMonitor();
      return;
    }
    if (settings.categories.performance) startPerformanceMonitor();
    const timer = window.setInterval(refreshDebugSnapshot, 250);
    refreshDebugSnapshot();
    return () => {
      window.clearInterval(timer);
      stopPerformanceMonitor();
    };
  }, [settings.enabled, settings.categories.performance]);

  if (!settings.enabled) return null;

  const closeDebug = () => {
    const updated = { ...settings, enabled: false };
    useDebugStore.setState({ settings: updated });
    void useMapStore.getState().setSetting("debugSettings", JSON.stringify(updated));
  };

  const visibleCategories = DEBUG_CATEGORIES.filter((category) => settings.categories[category.id]);
  const position = {
    "top-left": "top-3 left-3",
    "top-right": "top-3 right-3",
    "bottom-left": "bottom-3 left-3",
    "bottom-right": "bottom-3 right-3",
  }[settings.position];

  if (minimized) {
    return (
      <div
        className={`pointer-events-auto absolute ${position} z-40 flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 font-mono text-xs text-slate-800 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100`}
        style={{ opacity: Math.min(1, Math.max(0.6, settings.opacity)) }}
      >
        <span className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
          <Activity size={13} /> Debug
        </span>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="rounded p-0.5 hover:bg-slate-100 dark:hover:bg-zinc-800"
          title="Avaa debug-paneeli"
        >
          <Maximize2 size={12} />
        </button>
        <button
          type="button"
          onClick={closeDebug}
          className="rounded p-0.5 hover:bg-slate-100 dark:hover:bg-zinc-800"
          title="Sulje debug-overlay"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <aside
      className={`pointer-events-auto absolute ${position} z-40 max-h-[calc(100vh-2rem)] max-w-[min(28rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-slate-200 bg-white/95 p-3 font-mono text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 ${
        settings.fontSize === "medium" ? "text-xs" : "text-[11px]"
      }`}
      style={{ opacity: Math.min(1, Math.max(0.6, settings.opacity)) }}
      aria-label="Debug overlay"
    >
      <div className="mb-2 flex items-center justify-between border-b border-slate-200 pb-1.5 dark:border-zinc-800">
        <span className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
          <Activity size={14} className="text-blue-600 dark:text-blue-400" /> Diagnostiikka
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            title="Pienennä"
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            onClick={closeDebug}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            title="Sulje"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {visibleCategories.map((category) => {
        const values = DEBUG_VALUES[category.id].filter((value) => settings.values[value.id]);
        if (values.length === 0) return null;
        return (
          <section key={category.id} className={settings.compactMode ? "mb-1.5" : "mb-2.5"}>
            <h2 className="font-semibold text-blue-600 dark:text-sky-400">{category.label}</h2>
            {!settings.compactMode && <p className="text-[10px] text-slate-400 dark:text-zinc-500 mb-0.5">{category.description}</p>}
            <div className="space-y-0.5">
              {values.map((value) => (
                <div key={value.id} className="grid grid-cols-[auto_1fr] gap-x-3 text-slate-700 dark:text-zinc-300">
                  <span className="text-slate-500 dark:text-zinc-400">{value.label}:</span>
                  <span className="truncate text-right font-medium text-slate-900 dark:text-zinc-100">
                    {String(snapshot[value.id] ?? "–")}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {settings.categories.events && events.length > 0 && (
        <div className="border-t border-slate-200 pt-1.5 text-[10px] text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
          <div className="font-semibold mb-0.5 text-slate-700 dark:text-zinc-300">Tapahtumaloki:</div>
          {events.slice(-3).map((event) => (
            <div key={`${event.timestamp}-${event.message}`} className="truncate">
              {event.message}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
