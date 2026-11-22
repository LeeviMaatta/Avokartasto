import type { DebugCustomPosition } from "../model/debugTypes";

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
