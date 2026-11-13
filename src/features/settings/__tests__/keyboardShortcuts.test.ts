import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  findShortcutConflicts,
  formatShortcutLabel,
  isTextInputTarget,
  matchesShortcut,
  normalizeShortcutFromEvent,
  parseShortcuts,
} from "../model/keyboardShortcuts";

describe("keyboardShortcuts", () => {
  it("normalizes keyboard events including Finnish Shift+7 slash and numpad keys", () => {
    expect(
      normalizeShortcutFromEvent({
        key: "/",
        code: "Digit7",
        ctrlKey: false,
        altKey: false,
        shiftKey: true,
        metaKey: false,
      }),
    ).toBe("/");

    expect(
      normalizeShortcutFromEvent({
        key: ",",
        code: "Comma",
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBe("ctrl+,");

    expect(
      normalizeShortcutFromEvent({
        key: "L",
        code: "KeyL",
        ctrlKey: true,
        altKey: false,
        shiftKey: true,
        metaKey: false,
      }),
    ).toBe("ctrl+shift+l");

    expect(
      normalizeShortcutFromEvent({
        key: "=",
        code: "Equal",
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      }),
    ).toBe("+");

    expect(
      normalizeShortcutFromEvent({
        key: "Shift",
        code: "ShiftLeft",
        ctrlKey: false,
        altKey: false,
        shiftKey: true,
        metaKey: false,
      }),
    ).toBeNull();
  });

  it("parses overrides cleanly and preserves cleared or default bindings", () => {
    expect(parseShortcuts("")).toEqual(DEFAULT_SHORTCUTS);
    expect(parseShortcuts("not-json")).toEqual(DEFAULT_SHORTCUTS);

    const parsed = parseShortcuts(
      JSON.stringify({
        focusSearch: "Ctrl + F",
        focusLayers: "",
      }),
    );
    expect(parsed.focusSearch).toBe("ctrl+f");
    expect(parsed.focusLayers).toBe("");
    expect(parsed.toggleMeasure).toBe(DEFAULT_SHORTCUTS.toggleMeasure);
  });

  it("matches shortcut bindings and formats readable labels", () => {
    expect(
      matchesShortcut(
        { key: "k", code: "KeyK", ctrlKey: true, altKey: false, shiftKey: false, metaKey: false },
        "Ctrl+K",
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        { key: "+", code: "NumpadAdd", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false },
        "+",
      ),
    ).toBe(true);
    expect(formatShortcutLabel("+")).toBe("+");
    expect(formatShortcutLabel("ctrl++")).toBe("Ctrl + +");
    expect(formatShortcutLabel("ctrl+,")).toBe("Ctrl + ,");
    expect(formatShortcutLabel("")).toBe("Ei asetettu");
  });

  it("has conflict-free defaults and detects duplicate bindings", () => {
    expect(findShortcutConflicts(DEFAULT_SHORTCUTS).size).toBe(0);

    const conflicts = findShortcutConflicts({
      ...DEFAULT_SHORTCUTS,
      focusLayers: "m",
    });
    expect(conflicts.has("focusLayers")).toBe(true);
    expect(conflicts.has("toggleMeasure")).toBe(true);
    expect(conflicts.size).toBe(2);
  });

  it("distinguishes text inputs from non-text form controls", () => {
    class MockHTMLElement {}
    class MockHTMLInputElement extends MockHTMLElement {
      type: string;
      constructor(type: string) {
        super();
        this.type = type;
      }
    }
    class MockHTMLTextAreaElement extends MockHTMLElement {}
    class MockHTMLSelectElement extends MockHTMLElement {}

    vi.stubGlobal("HTMLElement", MockHTMLElement);
    vi.stubGlobal("HTMLInputElement", MockHTMLInputElement);
    vi.stubGlobal("HTMLTextAreaElement", MockHTMLTextAreaElement);
    vi.stubGlobal("HTMLSelectElement", MockHTMLSelectElement);

    try {
      expect(isTextInputTarget(new MockHTMLInputElement("text") as unknown as EventTarget)).toBe(true);
      expect(isTextInputTarget(new MockHTMLTextAreaElement() as unknown as EventTarget)).toBe(true);
      expect(isTextInputTarget(new MockHTMLSelectElement() as unknown as EventTarget)).toBe(true);
      expect(isTextInputTarget(new MockHTMLInputElement("checkbox") as unknown as EventTarget)).toBe(false);
      expect(isTextInputTarget(new MockHTMLElement() as unknown as EventTarget)).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
