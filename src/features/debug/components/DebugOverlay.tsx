import { useEffect, useState } from "react";
import { X, Minus, Maximize2, Activity, GripHorizontal } from "lucide-react";
import { refreshDebugSnapshot, startPerformanceMonitor, stopPerformanceMonitor } from "../services/debugMonitor";
import { useDebugStore } from "../model/debugStore";
import { DEBUG_CATEGORIES, DEBUG_VALUES } from "../model/debugTypes";
import { useMapStore } from "../../../store/mapStore";
import { focusMapViewport, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import { useDebugDrag } from "../hooks/useDebugDrag";

export { clampDebugPosition, toRelativeDebugPosition, resolveDebugPosition } from "../services/debugPosition";

export default function DebugOverlay() {
  const settings = useDebugStore((state) => state.settings);
  const snapshot = useDebugStore((state) => state.snapshot);
  const events = useDebugStore((state) => state.events);
  const [minimized, setMinimized] = useState(false);
  const { coords, containerRef, startDrag } = useDebugDrag(settings.enabled, minimized, settings.customPosition);

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
    const updated = { ...settings, enabled: false, showTileBoundaries: false };
    useDebugStore.setState({ settings: updated });
    void useMapStore.getState().setSetting("debugSettings", JSON.stringify(updated));
  };

  const visibleCategories = DEBUG_CATEGORIES.filter((category) => settings.categories[category.id]);
  const positionClass = coords
    ? ""
    : {
        "top-left": "top-3 left-3",
        "top-right": "top-3 right-3",
        "bottom-left": "bottom-3 left-3",
        "bottom-right": "bottom-3 right-3",
      }[settings.position];
  const overlayStyle: React.CSSProperties = {
    opacity: Math.min(1, Math.max(0.6, settings.opacity)),
    ...(coords ? { left: coords.left, top: coords.top } : {}),
  };

  if (minimized) {
    return (
      <div
        ref={containerRef}
        onPointerDown={startDrag}
        className={`pointer-events-auto fixed ${positionClass} z-40 flex cursor-grab select-none items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 font-mono text-xs text-slate-800 shadow-xl backdrop-blur-md active:cursor-grabbing dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100`}
        style={overlayStyle}
      >
        <span className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
          <GripHorizontal size={13} className="text-slate-400 dark:text-zinc-500" />
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
      ref={containerRef}
      onKeyDown={(e) =>
        handleContainerArrowKeyDown(e, {
          orientation: "both",
          onEscape: () => {
            closeDebug();
            focusMapViewport();
          },
        })
      }
      className={`pointer-events-auto fixed ${positionClass} z-40 flex max-h-[calc(100vh-2rem)] max-w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/95 font-mono text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 ${
        settings.fontSize === "medium" ? "text-xs" : "text-[11px]"
      }`}
      style={overlayStyle}
      aria-label="Debug overlay"
    >
      <div className="overflow-y-auto p-3">
        <div
          onPointerDown={startDrag}
          className="mb-2 flex cursor-grab select-none items-center justify-between border-b border-slate-200 pb-1.5 active:cursor-grabbing dark:border-zinc-800"
          title="Raahaa siirtääksesi"
        >
          <span className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
            <GripHorizontal size={14} className="text-slate-400 dark:text-zinc-500" />
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
          if (values.length === 0 && category.id !== "tiles") return null;
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
              {category.id === "tiles" && (
                <label className="mt-1 flex cursor-pointer items-center justify-between gap-2 rounded bg-slate-100/70 px-1.5 py-1 text-slate-700 hover:bg-slate-200/70 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-800/80">
                  <span>Tiilien rajat kartalla</span>
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded accent-blue-600"
                    checked={Boolean(settings.showTileBoundaries)}
                    onChange={(e) => {
                      const updated = { ...settings, showTileBoundaries: e.target.checked };
                      void useDebugStore.getState().updateSettings(updated);
                    }}
                  />
                </label>
              )}
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
      </div>
    </aside>
  );
}
