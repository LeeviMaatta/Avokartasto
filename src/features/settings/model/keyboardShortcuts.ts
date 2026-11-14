export type ShortcutCategory = "menus" | "tools" | "map";

export type ShortcutActionId =
  | "focusSearch"
  | "focusLayers"
  | "focusMarkers"
  | "openSettings"
  | "openWeather"
  | "focusCopernicus"
  | "toggleDebug"
  | "focusToolbar"
  | "toggleMeasure"
  | "toggleRoute"
  | "addMarkerAtCenter"
  | "toggleTheme"
  | "zoomIn"
  | "zoomOut"
  | "locateUser"
  | "resetRotation"
  | "toggleFullscreen";

export interface ShortcutDefinition {
  id: ShortcutActionId;
  category: ShortcutCategory;
  label: string;
  defaultKey: string;
}

export const SHORTCUT_CATEGORIES: { id: ShortcutCategory; label: string }[] = [
  { id: "menus", label: "Valikot ja ikkunat" },
  { id: "tools", label: "Työkalut" },
  { id: "map", label: "Karttanäkymä" },
];

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: "focusSearch", category: "menus", label: "Paikkahaku (myös Ctrl+K)", defaultKey: "/" },
  { id: "focusLayers", category: "menus", label: "Karttatasot-valikko", defaultKey: "l" },
  { id: "focusMarkers", category: "menus", label: "Merkit-valikko", defaultKey: "b" },
  { id: "openSettings", category: "menus", label: "Asetukset", defaultKey: "ctrl+," },
  { id: "openWeather", category: "menus", label: "Sääennuste", defaultKey: "w" },
  { id: "focusCopernicus", category: "menus", label: "Copernicus-paneeli", defaultKey: "c" },
  { id: "toggleDebug", category: "menus", label: "Diagnostiikka / Debug-ikkuna", defaultKey: "d" },
  { id: "focusToolbar", category: "menus", label: "Oikea työkalupalkki", defaultKey: "f10" },
  { id: "toggleMeasure", category: "tools", label: "Mittaustyökalu", defaultKey: "m" },
  { id: "toggleRoute", category: "tools", label: "Reititystyökalu", defaultKey: "r" },
  { id: "addMarkerAtCenter", category: "tools", label: "Lisää merkki kartan keskikohtaan", defaultKey: "p" },
  { id: "toggleTheme", category: "tools", label: "Vaihda vaalea / tumma teema", defaultKey: "t" },
  { id: "zoomIn", category: "map", label: "Lähennä karttaa", defaultKey: "+" },
  { id: "zoomOut", category: "map", label: "Loitonna karttaa", defaultKey: "-" },
  { id: "locateUser", category: "map", label: "Oma sijainti", defaultKey: "g" },
  { id: "resetRotation", category: "map", label: "Käännä pohjoinen ylös", defaultKey: "n" },
  { id: "toggleFullscreen", category: "map", label: "Koko ruutu", defaultKey: "f" },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutActionId, string> = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map((def) => [def.id, def.defaultKey]),
) as Record<ShortcutActionId, string>;

export const DEFAULT_ROTATION_KEY = "alt+shift";
export const DEFAULT_ARROW_ZOOM_KEY = "shift";

const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta", "os", "altgraph"]);

export function isModifierKey(rawKey: string): boolean {
  return MODIFIER_KEYS.has(rawKey.toLowerCase());
}

export function getModifiersFromEvent(
  event: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
): string[] {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  if (event.metaKey) parts.push("meta");
  return parts;
}

export function normalizeSingleKey(rawKey: string, code?: string): string {
  if (code === "NumpadAdd") return "+";
  if (code === "NumpadSubtract") return "-";
  if (code === "NumpadDivide") return "/";
  if (rawKey === " " || rawKey === "Spacebar" || code === "Space") return "space";
  const lower = rawKey.toLowerCase();
  if (lower === "=") return "+";
  if (lower === "esc") return "escape";
  return lower;
}

function splitNormalizedCombo(normalized: string): string[] {
  if (!normalized) return [];
  const endsWithPlus = normalized === "+" || normalized.endsWith("++");
  const parts = normalized.split("+").filter(Boolean);
  if (endsWithPlus) parts.push("+");
  return parts;
}

export function normalizeShortcutString(combo: string): string {
  const trimmed = combo.trim().toLowerCase();
  if (!trimmed) return "";
  const endsWithPlus = trimmed === "+" || trimmed.endsWith("++");
  const parts = trimmed.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 && !endsWithPlus) return "";
  const keyPart = endsWithPlus ? "+" : (parts.pop() ?? "");
  const mods = new Set(parts);
  const ordered: string[] = [];
  if (mods.has("ctrl") || mods.has("control")) ordered.push("ctrl");
  if (mods.has("alt")) ordered.push("alt");
  if (mods.has("shift")) ordered.push("shift");
  if (mods.has("meta") || mods.has("cmd")) ordered.push("meta");
  const normalizedKey = normalizeSingleKey(keyPart);
  if (!normalizedKey || MODIFIER_KEYS.has(normalizedKey)) return "";
  ordered.push(normalizedKey);
  return ordered.join("+");
}

export function normalizeRotationKeyString(combo: string): string {
  const trimmed = combo.trim().toLowerCase();
  if (!trimmed) return "";
  const endsWithPlus = trimmed === "+" || trimmed.endsWith("++");
  const parts = trimmed.split("+").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 && !endsWithPlus) return "";

  const mods = new Set<string>();
  let keyPart = endsWithPlus ? "+" : "";

  for (const part of parts) {
    if (part === "ctrl" || part === "control") {
      mods.add("ctrl");
    } else if (part === "alt") {
      mods.add("alt");
    } else if (part === "shift") {
      mods.add("shift");
    } else if (part === "meta" || part === "cmd" || part === "os") {
      mods.add("meta");
    } else if (!MODIFIER_KEYS.has(part)) {
      keyPart = normalizeSingleKey(part);
    }
  }

  const ordered: string[] = [];
  if (mods.has("ctrl")) ordered.push("ctrl");
  if (mods.has("alt")) ordered.push("alt");
  if (mods.has("shift")) ordered.push("shift");
  if (mods.has("meta")) ordered.push("meta");
  if (keyPart) ordered.push(keyPart);
  return ordered.join("+");
}

export interface ParsedRotationKey {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  key: string | null;
}

export function parseRotationKey(combo?: string, defaultKey = DEFAULT_ROTATION_KEY): ParsedRotationKey {
  const normalized = normalizeRotationKeyString(combo || defaultKey) || defaultKey;
  const parts = splitNormalizedCombo(normalized);
  const modSet = new Set(["ctrl", "alt", "shift", "meta"]);
  let key: string | null = null;
  for (const part of parts) {
    if (!modSet.has(part)) key = part;
  }
  return {
    ctrl: parts.includes("ctrl"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    meta: parts.includes("meta"),
    key,
  };
}

export function matchesModifierCombo(
  event: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
  parsed: ParsedRotationKey,
  heldKeysByCode?: ReadonlyMap<string, string>,
): boolean {
  if (
    Boolean(event.ctrlKey) !== parsed.ctrl ||
    Boolean(event.altKey) !== parsed.alt ||
    Boolean(event.shiftKey) !== parsed.shift ||
    Boolean(event.metaKey) !== parsed.meta
  ) {
    return false;
  }
  if (parsed.key) {
    if (!heldKeysByCode) return false;
    for (const held of heldKeysByCode.values()) {
      if (held === parsed.key) return true;
    }
    return false;
  }
  return true;
}

export function normalizeShortcutFromEvent(
  event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
): string | null {
  const key = normalizeSingleKey(event.key, event.code);
  if (!key || MODIFIER_KEYS.has(key)) return null;

  const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  // Sisällytetään Shift vain, jos mukana on muu apunäppäin ja merkki on kirjain/numero/F-näppäin,
  // jotta esim. suomalaisella näppäimistöllä "/" (Shift+7) ei muutu "shift+/"-yhdistelmäksi.
  if (event.shiftKey && ((hasModifier && /^[a-z0-9]$|^f\d{1,2}$/i.test(key)) || (!hasModifier && /^f\d{1,2}$/i.test(key)))) {
    parts.push("shift");
  }
  if (event.metaKey) parts.push("meta");
  parts.push(key);
  return parts.join("+");
}

export function parseShortcuts(raw?: string): Record<ShortcutActionId, string> {
  if (!raw) return { ...DEFAULT_SHORTCUTS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...DEFAULT_SHORTCUTS };
    }
    const result: Record<ShortcutActionId, string> = { ...DEFAULT_SHORTCUTS };
    const record = parsed as Record<string, unknown>;
    for (const def of SHORTCUT_DEFINITIONS) {
      const value = record[def.id];
      if (typeof value === "string") {
        result[def.id] = value === "" ? "" : normalizeShortcutString(value);
      }
    }
    return result;
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function matchesShortcut(
  event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
  binding: string,
): boolean {
  const target = normalizeShortcutString(binding);
  if (!target) return false;
  const pressed = normalizeShortcutFromEvent(event);
  return pressed !== null && pressed === target;
}

const MOD_LABELS: Record<string, string> = {
  ctrl: "Ctrl",
  alt: "Alt",
  shift: "Shift",
  meta: "Meta",
};

const KEY_LABELS: Record<string, string> = {
  space: "Space",
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

export function findShortcutConflicts(shortcuts: Record<ShortcutActionId, string>): Set<ShortcutActionId> {
  const byCombo = new Map<string, ShortcutActionId[]>();
  for (const def of SHORTCUT_DEFINITIONS) {
    const combo = normalizeShortcutString(shortcuts[def.id] ?? "");
    if (!combo) continue;
    const list = byCombo.get(combo) ?? [];
    list.push(def.id);
    byCombo.set(combo, list);
  }
  const conflicts = new Set<ShortcutActionId>();
  for (const list of byCombo.values()) {
    if (list.length > 1) {
      list.forEach((id) => conflicts.add(id));
    }
  }
  return conflicts;
}

const NON_TEXT_INPUT_TYPES = new Set(["checkbox", "radio", "button", "submit", "reset"]);

export function isTextInputTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has((target.type || "text").toLowerCase());
  }
  return false;
}
