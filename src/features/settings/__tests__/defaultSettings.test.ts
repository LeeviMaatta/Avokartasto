import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../model/defaultSettings";
import { SETTING_TOGGLES, SETTING_VALUE_KEYS } from "../model/settingFields";

describe("settings color and interaction defaults", () => {
  it("defines distinct saved and unsaved hex colors for markers and measurements", () => {
    expect(DEFAULT_SETTINGS.savedMarkerColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DEFAULT_SETTINGS.unsavedMarkerColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DEFAULT_SETTINGS.savedMeasurementColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(DEFAULT_SETTINGS.unsavedMeasurementColor).toMatch(/^#[0-9a-f]{6}$/i);

    expect(DEFAULT_SETTINGS.savedMarkerColor).not.toBe(DEFAULT_SETTINGS.unsavedMarkerColor);
    expect(DEFAULT_SETTINGS.savedMeasurementColor).not.toBe(DEFAULT_SETTINGS.unsavedMeasurementColor);
  });

  it("persists all color keys and backdropLayerId in SETTING_VALUE_KEYS and double-click reset toggle in SETTING_TOGGLES", () => {
    expect(DEFAULT_SETTINGS.backdropLayerId).toBe("");
    expect(SETTING_VALUE_KEYS).toContain("backdropLayerId");
    expect(SETTING_VALUE_KEYS).toContain("savedMarkerColor");
    expect(SETTING_VALUE_KEYS).toContain("unsavedMarkerColor");
    expect(SETTING_VALUE_KEYS).toContain("savedMeasurementColor");
    expect(SETTING_VALUE_KEYS).toContain("unsavedMeasurementColor");
    expect(DEFAULT_SETTINGS.keyboardShortcutsEnabled).toBe("1");
    expect(DEFAULT_SETTINGS.keyboardShortcuts).toBe("");
    expect(DEFAULT_SETTINGS.rotationKey).toBe("alt+shift");
    expect(SETTING_VALUE_KEYS).toContain("keyboardShortcutsEnabled");
    expect(SETTING_VALUE_KEYS).toContain("keyboardShortcuts");
    expect(SETTING_VALUE_KEYS).toContain("rotationKey");
    expect(SETTING_TOGGLES.map(([key]) => key)).toContain("removePendingMarkerOnDblClick");
    expect(DEFAULT_SETTINGS.enableTerrainRouting).toBe("1");
    expect(SETTING_TOGGLES.map(([key]) => key)).toContain("enableTerrainRouting");
    expect(DEFAULT_SETTINGS.segmentLengthMinDistance).toBe("500");
    expect(DEFAULT_SETTINGS.hideSegmentLengthsByZoom).toBe("1");
    expect(DEFAULT_SETTINGS.segmentLengthsMinZoom).toBe("13");
    expect(SETTING_TOGGLES.map(([key]) => key)).toContain("hideSegmentLengthsByZoom");
    expect(SETTING_VALUE_KEYS).toContain("segmentLengthMinDistance");
    expect(SETTING_VALUE_KEYS).toContain("segmentLengthsMinZoom");
  });
});
