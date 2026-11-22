import { describe, expect, it } from "vitest";
import {
  BACKDROP_MAX_ZOOM,
  DEFAULT_BACKDROP_CENTER,
  lonLatToTile,
  planBackdropTiles,
  resolveBackdropCenter,
} from "../backdropCache";

describe("backdropCache tile planning", () => {
  it("caps preloaded zoom levels at BACKDROP_MAX_ZOOM (14) to avoid high-zoom explosion", () => {
    const tiles = planBackdropTiles([24.94, 60.17], 0, 19);
    const maxZ = Math.max(...tiles.map((t) => t.z));
    expect(BACKDROP_MAX_ZOOM).toBe(14);
    expect(maxZ).toBe(14);
    // z=0..3 global (1+4+16+64 = 85) + z=4..14 focused 5x5 (11 * 25 = 275) = 360
    expect(tiles.length).toBe(360);
  });

  it("respects sources with max_zoom below BACKDROP_MAX_ZOOM and minZoom > 0", () => {
    const tiles = planBackdropTiles([24.94, 60.17], 4, 10);
    const zooms = new Set(tiles.map((t) => t.z));
    expect(Math.min(...zooms)).toBe(4);
    expect(Math.max(...zooms)).toBe(10);
    expect(tiles.length).toBe(7 * 25);
  });

  it("places center tile first within each zoom level", () => {
    const center: [number, number] = [24.94, 60.17];
    const tiles = planBackdropTiles(center, 12, 12);
    const expectedCenter = lonLatToTile(center[0], center[1], 12);
    expect(tiles[0]).toEqual({ z: 12, x: expectedCenter.x, y: expectedCenter.y });
  });

  it("resolves center coordinate in priority order", () => {
    expect(
      resolveBackdropCenter(
        { initialMapCenter: "[21.1,61.2]", lastMapCenter: "[22.1,62.2]" },
        [24.9, 60.2],
      ),
    ).toEqual([24.9, 60.2]);

    expect(
      resolveBackdropCenter(
        { initialMapCenter: "[21.1,61.2]", lastMapCenter: "[22.1,62.2]" },
        null,
      ),
    ).toEqual([21.1, 61.2]);

    expect(resolveBackdropCenter({ lastMapCenter: "[22.1,62.2]" }, null)).toEqual([22.1, 62.2]);
    expect(resolveBackdropCenter({}, null)).toEqual(DEFAULT_BACKDROP_CENTER);
  });
});
