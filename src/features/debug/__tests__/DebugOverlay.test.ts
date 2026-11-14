import { describe, expect, it } from "vitest";
import type OlMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import { fromLonLat } from "ol/proj";
import { clampDebugPosition, resolveDebugPosition, toRelativeDebugPosition } from "../components/DebugOverlay";
import { countTilesInView } from "../services/debugMonitor";
import { DEBUG_VALUES, DEFAULT_DEBUG_SETTINGS, parseDebugSettings } from "../model/debugTypes";

describe("DebugOverlay positioning", () => {
  it("clamps a legacy 2K edge-pinned position inside an FHD viewport", () => {
    const pos2k = { left: 2192, top: 1012 };
    const clampedFhd = clampDebugPosition(pos2k, { width: 360, height: 420 }, { width: 1920, height: 1080 });

    expect(clampedFhd).toEqual({
      left: 1920 - 360 - 8,
      top: 1080 - 420 - 8,
    });
  });

  it("enforces minimum padding when position is negative or viewport is very small", () => {
    expect(clampDebugPosition({ left: -50, top: -20 }, { width: 320, height: 300 }, { width: 1280, height: 720 })).toEqual({
      left: 8,
      top: 8,
    });

    expect(clampDebugPosition({ left: 500, top: 500 }, { width: 400, height: 400 }, { width: 320, height: 320 })).toEqual({
      left: 8,
      top: 8,
    });
  });

  it("preserves proportional position across 2K <-> FHD transitions and window resizes", () => {
    const box = { width: 360, height: 420 };
    const viewport2k = { width: 2560, height: 1440 };
    const viewportFhd = { width: 1920, height: 1080 };

    // Keskellä oleva ikkuna 2K-ruudulla
    const centered2k = toRelativeDebugPosition(
      { left: Math.round((2560 - 360) / 2), top: Math.round((1440 - 420) / 2) },
      box,
      viewport2k,
    );
    expect(centered2k.xRatio).toBeCloseTo(0.5, 4);
    expect(centered2k.yRatio).toBeCloseTo(0.5, 4);

    // Pysyy keskellä myös FHD-ruudulla ja palattaessa 2K-ruudulle
    const resolvedFhd = resolveDebugPosition(centered2k, box, viewportFhd);
    expect(resolvedFhd.left).toBe(Math.round((1920 - 360) / 2));
    expect(resolvedFhd.top).toBe(Math.round((1080 - 420) / 2));

    // Oikeaan reunaan raahattu ikkuna pysyy oikeassa reunassa kaikissa resoluutioissa
    const rightEdge2k = toRelativeDebugPosition({ left: 2560 - 360 - 8, top: 8 }, box, viewport2k);
    expect(rightEdge2k.xRatio).toBe(1);
    expect(rightEdge2k.yRatio).toBe(0);

    const rightEdgeFhd = resolveDebugPosition(rightEdge2k, box, viewportFhd);
    expect(rightEdgeFhd.left).toBe(1920 - 360 - 8);
    expect(rightEdgeFhd.top).toBe(8);

    // Vaikka ikkuna kutistetaan väliaikaisesti hyvin kapeaksi, suhdeluku säilyy suurennettaessa
    const narrow = resolveDebugPosition(rightEdgeFhd, box, { width: 320, height: 500 });
    expect(narrow.left).toBe(8);
    expect(narrow.xRatio).toBe(1);

    const restored2k = resolveDebugPosition(narrow, box, viewport2k);
    expect(restored2k.left).toBe(2560 - 360 - 8);
  });
});

describe("debug tile metrics and settings", () => {
  it("includes tiles.inView and preserves showTileBoundaries in parseDebugSettings", () => {
    expect(DEBUG_VALUES.tiles.some((v) => v.id === "tiles.inView")).toBe(true);
    expect(DEFAULT_DEBUG_SETTINGS.showTileBoundaries).toBe(false);

    const enabled = parseDebugSettings(JSON.stringify({ showTileBoundaries: true }));
    expect(enabled.showTileBoundaries).toBe(true);
    expect(enabled.values["tiles.inView"]).toBe(true);

    const fallback = parseDebugSettings("invalid-json");
    expect(fallback.showTileBoundaries).toBe(false);
  });

  it("counts visible tiles in view for basemap and overlay tile layers", () => {
    expect(countTilesInView(null)).toBeNull();

    const basemap = new TileLayer({
      source: new XYZ({ url: "https://example.com/{z}/{x}/{y}.png" }),
    });
    basemap.set("avokartasto-layer-type", "basemap");

    const overlay = new TileLayer({
      source: new XYZ({ url: "https://example.com/overlay/{z}/{x}/{y}.png" }),
    });
    overlay.set("avokartasto-layer-type", "overlay");
    overlay.setVisible(false);

    const view = new View({ center: fromLonLat([24.94, 60.17]), zoom: 10 });
    const mockMap = {
      getView: () => view,
      getSize: () => [1024, 768],
      getLayers: () => ({ getArray: () => [basemap, overlay] }),
    } as unknown as OlMap;

    const basemapOnly = countTilesInView(mockMap);
    expect(typeof basemapOnly).toBe("string");
    expect(String(basemapOnly)).toMatch(/^\d+ \(\d+ × \d+\)$/);

    overlay.setVisible(true);
    const withOverlay = countTilesInView(mockMap);
    expect(String(withOverlay)).toMatch(/^\d+ \(\d+ pohja, \d+ päällys\)$/);
  });
});
