export const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta", "os", "altgraph"]);

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

export function splitNormalizedCombo(normalized: string): string[] {
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

export function parseRotationKey(combo?: string, defaultKey = "alt+shift"): ParsedRotationKey {
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

export function matchesShortcut(
  event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
  binding: string,
): boolean {
  const target = normalizeShortcutString(binding);
  if (!target) return false;
  const pressed = normalizeShortcutFromEvent(event);
  return pressed !== null && pressed === target;
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
