import { describe, expect, it } from "vitest";
import {
  buildCopernicusWmsParams,
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
  });
});
