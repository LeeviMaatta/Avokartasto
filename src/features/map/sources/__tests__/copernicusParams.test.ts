import { describe, expect, it } from "vitest";
import {
  buildCopernicusWmsParams,
  formatCopernicusTimeLabel,
  isCopernicusActiveForSelection,
  isCopernicusSource,
  resolveCopernicusTimeRange,
} from "../copernicusParams";

describe("copernicusParams", () => {
  it("identifies Copernicus sources by builtin_key or host", () => {
    expect(isCopernicusSource({ builtin_key: "copernicus-s2", url: "" })).toBe(true);
    expect(isCopernicusSource({ builtin_key: null, url: "https://sh.dataspace.copernicus.eu/ogc/wms/abc" })).toBe(true);
    expect(isCopernicusSource({ builtin_key: "osm", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png" })).toBe(false);
  });

  it("builds single-day and cross-year season time ranges with leap-day clamping", () => {
    expect(
      resolveCopernicusTimeRange({
        copernicusDateMode: "single",
        copernicusSingleDate: "2025-07-14",
      }),
    ).toBe("2025-07-14T00:00:00Z/2025-07-14T23:59:59Z");

    expect(
      resolveCopernicusTimeRange({
        copernicusDateMode: "range",
        copernicusRangeYear: "2025",
        copernicusRangeStart: "12-01",
        copernicusRangeEnd: "02-29",
      }),
    ).toBe("2025-12-01/2026-02-28");
  });

  it("clamps cloud cover and chooses expected default priority", () => {
    const params = buildCopernicusWmsParams({
      copernicusLayerName: "NDVI",
      copernicusMaxCloud: "150",
      copernicusDateMode: "range",
      copernicusRangeYear: "2024",
      copernicusRangeStart: "06-01",
      copernicusRangeEnd: "08-31",
    });
    expect(params.LAYERS).toBe("NDVI");
    expect(params.MAXCC).toBe(100);
    expect(params.PRIORITY).toBe("leastCC");
    expect(params.TIME).toBe("2024-06-01/2024-08-31");

    const latestParams = buildCopernicusWmsParams({
      copernicusDateMode: "latest",
      copernicusPriority: "mostRecent",
    });
    expect(latestParams.PRIORITY).toBe("leastCC");
  });

  it("supports stepping to a specific day inside range bounds and resets outside bounds", () => {
    const inside = {
      copernicusDateMode: "range",
      copernicusRangeYear: "2024",
      copernicusRangeStart: "06-01",
      copernicusRangeEnd: "08-31",
      copernicusRangeSelectedDate: "2024-07-14",
    };
    expect(resolveCopernicusTimeRange(inside)).toBe("2024-07-14T00:00:00Z/2024-07-14T23:59:59Z");
    expect(formatCopernicusTimeLabel(inside)).toBe("14.7.2024");

    const outside = {
      ...inside,
      copernicusRangeSelectedDate: "2024-09-05",
    };
    expect(resolveCopernicusTimeRange(outside)).toBe("2024-06-01/2024-08-31");
    expect(formatCopernicusTimeLabel(outside)).toBe("1.6.2024 – 31.8.2024");
  });

  it("activates Copernicus UI only when selected in its matching active role and not hidden", () => {
    const sources = [
      { id: 1, role: "basemap" as const, builtin_key: "osm", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png" },
      { id: 25, role: "basemap" as const, builtin_key: "copernicus-s2", url: "https://sh.dataspace.copernicus.eu/ogc/wms/abc" },
      { id: 26, role: "overlay" as const, builtin_key: null, url: "https://sh.dataspace.copernicus.eu/ogc/wms/def" },
    ];
    expect(isCopernicusActiveForSelection(sources, "src:25", [], [])).toBe(true);
    expect(isCopernicusActiveForSelection(sources, "src:1", [], [])).toBe(false);
    // Stale basemap ID stuck in overlays must NOT keep Copernicus UI open
    expect(isCopernicusActiveForSelection(sources, "src:1", ["src:25", "copernicus-s2"], [])).toBe(false);
    // Hidden Copernicus source must stay inactive
    expect(isCopernicusActiveForSelection(sources, "src:25", [], ["src:25"])).toBe(false);
    // Overlay-role Copernicus source works when checked in overlays
    expect(isCopernicusActiveForSelection(sources, "src:1", ["src:26"], [])).toBe(true);
    expect(isCopernicusActiveForSelection(sources, "src:1", ["src:26"], ["src:26"])).toBe(false);
  });
});
