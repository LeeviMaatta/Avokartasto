import { describe, expect, it } from "vitest";
import { parseCoordinateQuery } from "../domain/coordinateParser";

describe("parseCoordinateQuery", () => {
  it("parses decimal degrees with degree symbols and hemispheres", () => {
    const hit = parseCoordinateQuery("66.7089° N, 19.5342° E");
    expect(hit).not.toBeNull();
    expect(hit!.lat).toBeCloseTo(66.7089, 4);
    expect(hit!.lon).toBeCloseTo(19.5342, 4);
    expect(hit!.format).toBe("WGS84");
  });

  it("parses plain decimal pairs with comma, semicolon, or space", () => {
    for (const q of ["66.7089, 19.5342", "66.7089; 19.5342", "66.7089 19.5342"]) {
      const hit = parseCoordinateQuery(q);
      expect(hit).not.toBeNull();
      expect(hit!.lat).toBeCloseTo(66.7089, 4);
      expect(hit!.lon).toBeCloseTo(19.5342, 4);
    }
  });

  it("parses negative coordinates and S/W hemispheres", () => {
    const neg = parseCoordinateQuery("-33.8688, 151.2093");
    expect(neg?.lat).toBeCloseTo(-33.8688, 4);
    expect(neg?.lon).toBeCloseTo(151.2093, 4);

    const sw = parseCoordinateQuery("33.8688° S, 70.6693° W");
    expect(sw?.lat).toBeCloseTo(-33.8688, 4);
    expect(sw?.lon).toBeCloseTo(-70.6693, 4);
  });

  it("handles leading hemispheres and swapped E/W before N/S", () => {
    const lead = parseCoordinateQuery("N 66.7089, E 19.5342");
    expect(lead?.lat).toBeCloseTo(66.7089, 4);
    expect(lead?.lon).toBeCloseTo(19.5342, 4);

    const swapped = parseCoordinateQuery("19.5342° E, 66.7089° N");
    expect(swapped?.lat).toBeCloseTo(66.7089, 4);
    expect(swapped?.lon).toBeCloseTo(19.5342, 4);
  });

  it("handles Finnish decimal commas with hemispheres", () => {
    const hit = parseCoordinateQuery("66,7089° N, 19,5342° E");
    expect(hit).not.toBeNull();
    expect(hit!.lat).toBeCloseTo(66.7089, 4);
    expect(hit!.lon).toBeCloseTo(19.5342, 4);
  });

  it("parses DMS and DDM formats", () => {
    const dms = parseCoordinateQuery("66° 42′ 32″ N, 19° 32′ 03″ E");
    expect(dms).not.toBeNull();
    expect(dms!.lat).toBeCloseTo(66 + 42 / 60 + 32 / 3600, 5);
    expect(dms!.lon).toBeCloseTo(19 + 32 / 60 + 3 / 3600, 5);

    const dmsCompact = parseCoordinateQuery(`66°42'32.04"N 19°32'3.12"E`);
    expect(dmsCompact).not.toBeNull();
    expect(dmsCompact!.lat).toBeCloseTo(66.7089, 4);
    expect(dmsCompact!.lon).toBeCloseTo(19.5342, 4);

    const ddm = parseCoordinateQuery("66° 42.534' N, 19° 32.052' E");
    expect(ddm).not.toBeNull();
    expect(ddm!.lat).toBeCloseTo(66 + 42.534 / 60, 4);
    expect(ddm!.lon).toBeCloseTo(19 + 32.052 / 60, 4);
  });

  it("parses ETRS-TM35FIN coordinates (labeled and unlabeled)", () => {
    // Helsinki ~ 60.1699 N, 24.9384 E -> N ~ 6672000, E ~ 385600
    const labeled = parseCoordinateQuery("N: 6672000, E: 385600");
    expect(labeled).not.toBeNull();
    expect(labeled!.format).toBe("ETRS-TM35FIN");
    expect(labeled!.lat).toBeCloseTo(60.17, 1);
    expect(labeled!.lon).toBeCloseTo(24.94, 1);

    const unlabeled = parseCoordinateQuery("6672000 385600");
    expect(unlabeled).not.toBeNull();
    expect(unlabeled!.format).toBe("ETRS-TM35FIN");
    expect(unlabeled!.lat).toBeCloseTo(labeled!.lat, 5);
    expect(unlabeled!.lon).toBeCloseTo(labeled!.lon, 5);
  });

  it("rejects non-coordinate queries and out-of-range values", () => {
    expect(parseCoordinateQuery("Helsinki")).toBeNull();
    expect(parseCoordinateQuery("Mannerheimintie 10, 20")).toBeNull();
    expect(parseCoordinateQuery("66,19")).toBeNull();
    expect(parseCoordinateQuery("95.0, 20.0")).toBeNull();
    expect(parseCoordinateQuery("60.0, 190.0")).toBeNull();
    expect(parseCoordinateQuery("66° 75' 00\" N, 19° 00' 00\" E")).toBeNull();
    expect(parseCoordinateQuery("66.7° N, 19.5° S")).toBeNull();
  });
});
