import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  getModifiersFromEvent,
  isModifierKey,
  normalizeRotationKeyString,
  normalizeShortcutFromEvent,
  normalizeSingleKey,
  parseShortcuts,
  type ShortcutActionId,
} from "../model/keyboardShortcuts";

export type ModifierSettingKey = "rotationKey" | "arrowZoomKey";

interface UseShortcutCaptureOptions {
  settingsOpen: boolean;
  setDraft: Dispatch<SetStateAction<Record<string, string>>>;
}

/** Captures keyboard shortcut combos and modifier keys while settings modal is open. */
export function useShortcutCapture({ settingsOpen, setDraft }: UseShortcutCaptureOptions) {
  const [capturingAction, setCapturingAction] = useState<ShortcutActionId | null>(null);
  const [capturingModifierSetting, setCapturingModifierSetting] =
    useState<ModifierSettingKey | null>(null);

  const capturingActionRef = useRef(capturingAction);
  capturingActionRef.current = capturingAction;
  const capturingModifierSettingRef = useRef(capturingModifierSetting);
  capturingModifierSettingRef.current = capturingModifierSetting;

  useEffect(() => {
    setCapturingAction(null);
    setCapturingModifierSetting(null);
  }, [settingsOpen]);

  useEffect(() => {
    if (!capturingAction) return;
    const handleCapture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setCapturingAction(null);
        return;
      }
      const combo = normalizeShortcutFromEvent(event);
      if (!combo) return;
      setDraft((prev) => {
        const current = parseShortcuts(prev.keyboardShortcuts);
        return {
          ...prev,
          keyboardShortcuts: JSON.stringify({ ...current, [capturingAction]: combo }),
        };
      });
      setCapturingAction(null);
    };
    window.addEventListener("keydown", handleCapture, true);
    return () => window.removeEventListener("keydown", handleCapture, true);
  }, [capturingAction, setDraft]);

  useEffect(() => {
    if (!capturingModifierSetting) return;
    let pendingModifiers = "";
    let completed = false;

    const finishCapture = (combo: string) => {
      if (completed || !combo) return;
      completed = true;
      setDraft((prev) => ({ ...prev, [capturingModifierSetting]: combo }));
      setCapturingModifierSetting(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (completed) return;
      if (event.key === "Escape") {
        completed = true;
        setCapturingModifierSetting(null);
        return;
      }
      if (isModifierKey(event.key)) {
        const mods = getModifiersFromEvent(event);
        if (mods.length > 0) {
          pendingModifiers = normalizeRotationKeyString(mods.join("+"));
        }
        return;
      }
      const key = normalizeSingleKey(event.key, event.code);
      const combo = normalizeRotationKeyString([...getModifiersFromEvent(event), key].join("+"));
      if (combo) {
        finishCapture(combo);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (completed) return;
      if (isModifierKey(event.key) && pendingModifiers) {
        event.preventDefault();
        event.stopPropagation();
        finishCapture(pendingModifiers);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [capturingModifierSetting, setDraft]);

  const clearCapture = () => {
    setCapturingAction(null);
    setCapturingModifierSetting(null);
  };

  return {
    capturingAction,
    setCapturingAction,
    capturingModifierSetting,
    setCapturingModifierSetting,
    capturingActionRef,
    capturingModifierSettingRef,
    clearCapture,
  };
}
