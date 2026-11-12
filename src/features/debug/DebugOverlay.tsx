import { useEffect } from "react";
import { refreshDebugSnapshot, startPerformanceMonitor, stopPerformanceMonitor } from "./debugMonitor";
import { useDebugStore } from "./debugStore";
import { DEBUG_CATEGORIES, DEBUG_VALUES } from "./model/debugTypes";

export default function DebugOverlay() {
  const settings = useDebugStore((state) => state.settings);
  const snapshot = useDebugStore((state) => state.snapshot);
  const events = useDebugStore((state) => state.events);

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
  const visibleCategories = DEBUG_CATEGORIES.filter((category) => settings.categories[category.id]);
  const position = {
    "top-left": "top-3 left-3",
    "top-right": "top-3 right-3",
    "bottom-left": "bottom-3 left-3",
    "bottom-right": "bottom-3 right-3",
  }[settings.position];

  return (
    <aside
      className={`pointer-events-none absolute ${position} z-40 max-h-[calc(100vh-1.5rem)] max-w-[min(28rem,calc(100vw-1.5rem))] overflow-auto rounded border border-slate-200 bg-white/95 p-2 font-mono text-slate-800 shadow-xl backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 ${settings.fontSize === "medium" ? "text-xs" : "text-[10px]"}`}
      style={{ opacity: Math.min(1, Math.max(0.6, settings.opacity)) }}
      aria-label="Debug overlay"
    >
      <div className="mb-1 border-b border-slate-200 pb-1 font-semibold dark:border-zinc-800">Debug overlay</div>
      {visibleCategories.map((category) => {
        const values = DEBUG_VALUES[category.id].filter((value) => settings.values[value.id]);
        if (values.length === 0) return null;
        return (
          <section key={category.id} className={settings.compactMode ? "mb-1" : "mb-2"}>
            <h2 className="text-sky-700 dark:text-sky-300">{category.label}</h2>
            {!settings.compactMode && <p className="text-slate-500 dark:text-zinc-400">{category.description}</p>}
            {values.map((value) => (
              <div key={value.id} className="grid grid-cols-[auto_1fr] gap-x-3">
                <span className="text-slate-600 dark:text-zinc-300">{value.label}</span>
                <span className="truncate text-right text-slate-900 dark:text-zinc-100">{String(snapshot[value.id] ?? "Unavailable")}</span>
              </div>
            ))}
          </section>
        );
      })}
      {settings.categories.events && events.length > 0 && (
        <div className="border-t border-slate-200 pt-1 text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
          {events.slice(-3).map((event) => <div key={`${event.timestamp}-${event.message}`}>{event.message}</div>)}
        </div>
      )}
    </aside>
  );
}
