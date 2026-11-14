import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X, Minus, Maximize2, Activity, GripHorizontal } from "lucide-react";
import { refreshDebugSnapshot, startPerformanceMonitor, stopPerformanceMonitor } from "../services/debugMonitor";
import { useDebugStore } from "../model/debugStore";
import { DEBUG_CATEGORIES, DEBUG_VALUES, type DebugCustomPosition } from "../model/debugTypes";
import { useMapStore } from "../../../store/mapStore";
import { focusMapViewport, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";

const OVERLAY_VIEWPORT_PADDING = 8;

export function clampDebugPosition(
  pos: { left: number; top: number },
  box: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const maxLeft = Math.max(OVERLAY_VIEWPORT_PADDING, viewport.width - box.width - OVERLAY_VIEWPORT_PADDING);
  const maxTop = Math.max(OVERLAY_VIEWPORT_PADDING, viewport.height - box.height - OVERLAY_VIEWPORT_PADDING);
  return {
    left: Math.min(maxLeft, Math.max(OVERLAY_VIEWPORT_PADDING, pos.left)),
    top: Math.min(maxTop, Math.max(OVERLAY_VIEWPORT_PADDING, pos.top)),
  };
}

export function toRelativeDebugPosition(
  pos: { left: number; top: number },
  box: { width: number; height: number },
  viewport: { width: number; height: number },
): DebugCustomPosition {
  const clamped = clampDebugPosition(pos, box, viewport);
  const spanX = Math.max(0, viewport.width - box.width - 2 * OVERLAY_VIEWPORT_PADDING);
  const spanY = Math.max(0, viewport.height - box.height - 2 * OVERLAY_VIEWPORT_PADDING);
  return {
    left: clamped.left,
    top: clamped.top,
    xRatio: spanX > 0 ? (clamped.left - OVERLAY_VIEWPORT_PADDING) / spanX : 0,
    yRatio: spanY > 0 ? (clamped.top - OVERLAY_VIEWPORT_PADDING) / spanY : 0,
  };
}

export function resolveDebugPosition(
  pos: DebugCustomPosition,
  box: { width: number; height: number },
  viewport: { width: number; height: number },
): DebugCustomPosition {
  if (typeof pos.xRatio === "number" && Number.isFinite(pos.xRatio) && typeof pos.yRatio === "number" && Number.isFinite(pos.yRatio)) {
    const xRatio = Math.min(1, Math.max(0, pos.xRatio));
    const yRatio = Math.min(1, Math.max(0, pos.yRatio));
    const spanX = Math.max(0, viewport.width - box.width - 2 * OVERLAY_VIEWPORT_PADDING);
    const spanY = Math.max(0, viewport.height - box.height - 2 * OVERLAY_VIEWPORT_PADDING);
    const clamped = clampDebugPosition(
      {
        left: Math.round(OVERLAY_VIEWPORT_PADDING + xRatio * spanX),
        top: Math.round(OVERLAY_VIEWPORT_PADDING + yRatio * spanY),
      },
      box,
      viewport,
    );
    return {
      left: clamped.left,
      top: clamped.top,
      xRatio,
      yRatio,
    };
  }
  const clamped = clampDebugPosition(pos, box, viewport);
  return { ...pos, left: clamped.left, top: clamped.top };
}

export default function DebugOverlay() {
  const settings = useDebugStore((state) => state.settings);
  const snapshot = useDebugStore((state) => state.snapshot);
  const events = useDebugStore((state) => state.events);
  const [minimized, setMinimized] = useState(false);
  const [coords, setCoords] = useState<DebugCustomPosition | null>(settings.customPosition ?? null);
  const coordsRef = useRef<DebugCustomPosition | null>(coords);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    width: number;
    height: number;
    moved: boolean;
  } | null>(null);

  const syncPositionToViewport = useCallback(() => {
    const current = coordsRef.current;
    const el = containerRef.current;
    if (!current || !el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    const resolved = resolveDebugPosition(
      current,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    if (resolved.left !== current.left || resolved.top !== current.top) {
      coordsRef.current = resolved;
      setCoords(resolved);
    }
  }, []);

  useEffect(() => {
    const next = settings.customPosition ?? null;
    coordsRef.current = next;
    setCoords(next);
  }, [settings.customPosition]);

  useLayoutEffect(() => {
    if (!settings.enabled || !coords) return;
    syncPositionToViewport();
  }, [settings.enabled, minimized, coords, syncPositionToViewport]);

  useEffect(() => {
    if (!settings.enabled || !coords) return;
    window.addEventListener("resize", syncPositionToViewport);
    const el = containerRef.current;
    const observer = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(syncPositionToViewport) : null;
    if (observer && el) observer.observe(el);
    return () => {
      window.removeEventListener("resize", syncPositionToViewport);
      observer?.disconnect();
    };
  }, [settings.enabled, minimized, Boolean(coords), syncPositionToViewport]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true;
      const next = toRelativeDebugPosition(
        { left: drag.startLeft + dx, top: drag.startTop + dy },
        { width: drag.width, height: drag.height },
        { width: window.innerWidth, height: window.innerHeight },
      );
      coordsRef.current = next;
      setCoords(next);
    };
    const handlePointerUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag?.moved && coordsRef.current) {
        const current = useDebugStore.getState().settings;
        void useDebugStore.getState().updateSettings({
          ...current,
          customPosition: coordsRef.current,
        });
      }
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
    e.preventDefault();
  };

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
