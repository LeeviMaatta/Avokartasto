import { normalizeRotationKeyString, normalizeShortcutString, splitNormalizedCombo } from "./shortcutMatcher";

const MOD_LABELS: Record<string, string> = {
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  meta: "Meta",
};

const KEY_LABELS: Record<string, string> = {
  space: "Space",
  tab: "Tab",
  escape: "Esc",
  enter: "Enter",
  delete: "Delete",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

function formatNormalizedCombo(normalized: string): string {
  if (!normalized) return "Ei asetettu";
  return splitNormalizedCombo(normalized)
    .map((part) => MOD_LABELS[part] ?? KEY_LABELS[part] ?? part.toUpperCase())
    .join(" + ");
}

export function formatShortcutLabel(combo: string): string {
  return formatNormalizedCombo(normalizeShortcutString(combo));
}

export function formatRotationKeyLabel(combo: string): string {
  return formatNormalizedCombo(normalizeRotationKeyString(combo));
}
