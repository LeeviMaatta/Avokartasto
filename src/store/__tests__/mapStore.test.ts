import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../infrastructure/tauri", () => ({
  getSettings: vi.fn(async () => ({})),
  listSources: vi.fn(async () => []),
  setSetting: vi.fn(async () => {}),
  setSettings: vi.fn(async () => {}),
}));

import { useMapStore } from "../mapStore";

describe("mapStore", () => {
  beforeEach(() => {
    useMapStore.setState({
      basemap: "src:1",
      overlays: ["src:10", "src:11"],
      overlayOrder: ["src:10", "src:11"],
      basemapOrder: ["src:1", "src:2"],
      sources: [
        {
          id: 2,
          name: "OpenStreetMap",
          base_path: "",
          pattern: "{z}/{x}/{y}.png",
          projection: "EPSG:3857",
          role: "basemap",
          opacity: 1,
          min_zoom: 0,
          max_zoom: 19,
          attribution: "",
          api_type: "xyz",
          tile_size: 256,
          layer_name: "",
          style: "",
          builtin_key: "osm",
          is_default: true,
          factory_json: null,
          kind: "raster",
          url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          params: "{}",
          auth: "",
          note: "",
          view_zoom_offset: 0,
          view_magnification: 1,
        },
      ],
      hiddenLayers: [],
      routePoints: [null, null],
      routeResult: null,
      routePickTarget: 0,
      persistenceError: null,
    });
  });

  it("toggles and reorders overlays", () => {
    useMapStore.getState().toggleOverlay("src:12");
    expect(useMapStore.getState().overlays).toEqual(["src:10", "src:11", "src:12"]);

    useMapStore.getState().reorderOverlays("src:11", "src:10");
    expect(useMapStore.getState().overlays).toEqual(["src:11", "src:10", "src:12"]);
  });

  it("hides and restores layers while keeping fallback basemap", () => {
    useMapStore.getState().hideLayer("src:1", "basemap");
    expect(useMapStore.getState().hiddenLayers).toContain("src:1");
    expect(useMapStore.getState().basemap).toBe("src:2");

    useMapStore.getState().restoreLayer("src:1", "basemap");
    expect(useMapStore.getState().hiddenLayers).not.toContain("src:1");
    expect(useMapStore.getState().basemap).toBe("src:1");
  });

  it("updates, swaps, and clears route points", () => {
    useMapStore.getState().setRoutePoint(0, { coord: [24.94, 60.17], label: "Helsinki" });
    useMapStore.getState().setRoutePoint(1, { coord: [23.76, 61.5], label: "Tampere" });
    useMapStore.getState().swapRoutePoints();
    expect(useMapStore.getState().routePoints[0]?.label).toBe("Tampere");
    expect(useMapStore.getState().routePoints[1]?.label).toBe("Helsinki");

    useMapStore.getState().clearRoute();
    expect(useMapStore.getState().routePoints).toEqual([null, null]);
  });

  it("resets active measurement state when toggling tools", () => {
    useMapStore.setState({
      tool: "measure",
      measure: { length: 120, geojson: "{\"type\":\"LineString\",\"coordinates\":[]}", kind: "distance" },
      activeUnsavedMeasurementId: "unsaved-1",
      editingFeatureId: 5,
    });

    useMapStore.getState().toggleTool("measure");
    const state = useMapStore.getState();
    expect(state.tool).toBe("none");
    expect(state.measure).toBeNull();
    expect(state.activeUnsavedMeasurementId).toBeNull();
    expect(state.editingFeatureId).toBeNull();
  });
});
