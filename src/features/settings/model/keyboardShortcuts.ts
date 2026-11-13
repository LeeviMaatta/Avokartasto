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

const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta", "os", "altgraph"]);

function normalizeSingleKey(rawKey: string, code?: string): string {
  if (code === "NumpadAdd") return "+";
  if (code === "NumpadSubtract") return "-";
  if (code === "NumpadDivide") return "/";
  if (rawKey === " " || rawKey === "Spacebar" || code === "Space") return "space";
  const lower = rawKey.toLowerCase();
  if (lower === "=") return "+";
  if (lower === "esc") return "escape";
  return lower;
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

export function formatShortcutLabel(combo: string): string {
  const normalized = normalizeShortcutString(combo);
  if (!normalized) return "Ei asetettu";
  const endsWithPlus = normalized === "+" || normalized.endsWith("++");
  const rawParts = normalized.split("+").filter(Boolean);
  const key = endsWithPlus ? "+" : (rawParts.pop() ?? "");
  const modLabels: Record<string, string> = {
    ctrl: "Ctrl",
    alt: "Alt",
    shift: "Shift",
    meta: "Meta",
  };
  const keyLabels: Record<string, string> = {
    space: "Space",
    escape: "Esc",
    enter: "Enter",
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
  };
  const displayMods = rawParts.map((m) => modLabels[m] ?? m.toUpperCase());
  const displayKey = keyLabels[key] ?? (key.length === 1 ? key.toUpperCase() : key.toUpperCase());
  return [...displayMods, displayKey].join(" + ");
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
