import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import {
  computeCursorBadgePosition,
  type LiveMeasurementBadgeState,
} from "../../measurements/domain/liveMeasurementBadge";

interface MeasurementCursorBadgeProps {
  badge: LiveMeasurementBadgeState | null;
  viewportRef: RefObject<HTMLDivElement | null>;
  opacity: number;
}

/** Floating badge displaying the live total length (or area) next to the map cursor while measuring. */
export function MeasurementCursorBadge({
  badge,
  viewportRef,
  opacity,
}: MeasurementCursorBadgeProps) {
  const badgeRef = useRef<HTMLDivElement | null>(null);
  if (!badge) return null;

  const viewportWidth = viewportRef.current?.clientWidth ?? 0;
  const viewportHeight = viewportRef.current?.clientHeight ?? 0;
  const badgeWidth = badgeRef.current?.offsetWidth || 72;
  const badgeHeight = badgeRef.current?.offsetHeight || 24;

  const { left, top } = computeCursorBadgePosition(
    badge.x,
    badge.y,
    badgeWidth,
    badgeHeight,
    viewportWidth,
    viewportHeight,
  );

  return (
    <div
      ref={badgeRef}
      data-live-measurement-badge="true"
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-20 whitespace-nowrap rounded-lg border border-slate-300 bg-white/95 px-2 py-0.5 font-mono text-xs font-semibold text-slate-900 shadow-md backdrop-blur dark:border-zinc-700 dark:bg-zinc-950/95 dark:text-zinc-100"
      style={{
        transform: `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`,
        opacity,
      }}
    >
      {badge.label}
    </div>
  );
}

interface MeasurementCursorOverlayProps {
  badgeUpdaterRef: MutableRefObject<((next: LiveMeasurementBadgeState | null) => void) | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  opacity: number;
}

/** Isolates high-frequency cursor badge updates from re-rendering the parent MapContainer. */
export function MeasurementCursorOverlay({
  badgeUpdaterRef,
  viewportRef,
  opacity,
}: MeasurementCursorOverlayProps) {
  const [badge, setBadge] = useState<LiveMeasurementBadgeState | null>(null);

  useEffect(() => {
    badgeUpdaterRef.current = setBadge;
    return () => {
      badgeUpdaterRef.current = null;
    };
  }, [badgeUpdaterRef]);

  return <MeasurementCursorBadge badge={badge} viewportRef={viewportRef} opacity={opacity} />;
}
