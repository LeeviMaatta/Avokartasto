import { useEffect } from "react";
import { useMapStore } from "../store/mapStore";
import { useDebugStore } from "../features/debug/debugStore";
import {
  isTextInputTarget,
  matchesShortcut,
  parseShortcuts,
  type ShortcutActionId,
} from "../features/settings/model/keyboardShortcuts";

export function dispatchShortcutEvent(name: string, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function useGlobalKeyboardShortcuts(): void {
  const settings = useMapStore((s) => s.settings);
  const enabled = settings.keyboardShortcutsEnabled !== "0";
  const shortcutsRaw = settings.keyboardShortcuts;

  useEffect(() => {
    if (!enabled) return;
    const shortcuts = parseShortcuts(shortcutsRaw);

    const runAction = (actionId: ShortcutActionId): void => {
      const state = useMapStore.getState();
      switch (actionId) {
        case "focusSearch":
          dispatchShortcutEvent("kb-focus-search");
          break;
        case "focusLayers":
          dispatchShortcutEvent("kb-focus-layers");
          break;
        case "focusMarkers":
          dispatchShortcutEvent("kb-focus-markers");
          break;
        case "openSettings":
          useMapStore.setState({ settingsOpen: !state.settingsOpen });
          break;
        case "openWeather":
          useMapStore.setState({ weatherModalOpen: !state.weatherModalOpen });
          break;
        case "focusCopernicus":
          dispatchShortcutEvent("kb-focus-copernicus");
          break;
        case "toggleDebug": {
          const currentDebug = useDebugStore.getState().settings;
          const updatedDebug = { ...currentDebug, enabled: !currentDebug.enabled };
          useDebugStore.setState({ settings: updatedDebug });
          void state.setSetting("debugSettings", JSON.stringify(updatedDebug));
          break;
        }
        case "focusToolbar":
          dispatchShortcutEvent("kb-focus-toolbar");
          break;
        case "toggleMeasure":
          state.toggleTool("measure");
          break;
        case "toggleRoute":
          state.toggleTool("route");
          break;
        case "addMarkerAtCenter":
          if (state.centerCoord) {
            useMapStore.setState({
              pendingMarker: state.centerCoord,
              tool: "none",
              editingFeatureId: null,
              activeUnsavedMeasurementId: null,
              selectedFeature: null,
              measure: null,
              profile: null,
              profileVisible: false,
              profileError: null,
            });
            dispatchShortcutEvent("kb-focus-measure-tool");
          }
          break;
        case "toggleTheme":
          void state.setSetting("theme", state.settings.theme === "dark" ? "light" : "dark");
          break;
        case "zoomIn":
        case "zoomOut":
        case "locateUser":
        case "resetRotation":
        case "toggleFullscreen":
          dispatchShortcutEvent("kb-map-action", actionId);
          break;
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (document.querySelector('[data-shortcut-capturing="true"]')) return;

      const state = useMapStore.getState();
      const modalOpen = Boolean(document.querySelector('[aria-modal="true"]'));
      const inTextInput = isTextInputTarget(event.target);

      // Ctrl+K toimii aina yleisenä paikkahaun pikanäppäimenä, ellei sitä ole sidottu muuhun toimintoon
      if (
        !modalOpen &&
        matchesShortcut(event, "ctrl+k") &&
        !Object.entries(shortcuts).some(([id, combo]) => id !== "focusSearch" && combo === "ctrl+k")
      ) {
        event.preventDefault();
        runAction("focusSearch");
        return;
      }

      for (const [id, binding] of Object.entries(shortcuts) as [ShortcutActionId, string][]) {
        if (!binding || !matchesShortcut(event, binding)) continue;

        const hasModifier = event.ctrlKey || event.altKey || event.metaKey;
        if (inTextInput && !hasModifier) continue;

        // Asetusikkunan tai muun modaalin ollessa auki sallitaan vain kyseisen modaalin pikakytkentä
        if (modalOpen) {
          if (state.settingsOpen && id === "openSettings") {
            event.preventDefault();
            runAction(id);
          } else if (state.weatherModalOpen && id === "openWeather" && !inTextInput) {
            event.preventDefault();
            runAction(id);
          }
          return;
        }

        event.preventDefault();
        runAction(id);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, shortcutsRaw]);
}
