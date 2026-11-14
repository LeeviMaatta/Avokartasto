import { MODIFIER_KEYS, normalizeShortcutString } from "./shortcutMatcher";

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

export { MODIFIER_KEYS };
