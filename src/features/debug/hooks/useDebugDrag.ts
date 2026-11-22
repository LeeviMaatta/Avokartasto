import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useDebugStore } from "../model/debugStore";
import type { DebugCustomPosition } from "../model/debugTypes";
import { resolveDebugPosition, toRelativeDebugPosition } from "../services/debugPosition";

interface DragState {
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
  width: number;
  height: number;
  moved: boolean;
}

export function useDebugDrag(enabled: boolean, minimized: boolean, customPosition?: DebugCustomPosition | null) {
  const [coords, setCoords] = useState<DebugCustomPosition | null>(customPosition ?? null);
  const coordsRef = useRef<DebugCustomPosition | null>(coords);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

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
    const next = customPosition ?? null;
    coordsRef.current = next;
    setCoords(next);
  }, [customPosition]);

  useLayoutEffect(() => {
    if (!enabled || !coords) return;
    syncPositionToViewport();
  }, [enabled, minimized, coords, syncPositionToViewport]);

  useEffect(() => {
    if (!enabled || !coords) return;
    window.addEventListener("resize", syncPositionToViewport);
    const el = containerRef.current;
    const observer = typeof ResizeObserver !== "undefined" && el ? new ResizeObserver(syncPositionToViewport) : null;
    if (observer && el) observer.observe(el);
    return () => {
      window.removeEventListener("resize", syncPositionToViewport);
      observer?.disconnect();
    };
  }, [enabled, minimized, Boolean(coords), syncPositionToViewport]);

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

  return { coords, containerRef, startDrag };
}
