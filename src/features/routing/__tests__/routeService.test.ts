import { describe, expect, it } from "vitest";
import {
  decodePolyline,
  formatRouteDistance,
  formatRouteDuration,
} from "../services/routeService";

describe("routeService", () => {
  it("decodes precision-5 polylines into [lon, lat] pairs", () => {
    const coords = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5);
    expect(coords).toHaveLength(3);
    expect(coords[0][0]).toBeCloseTo(-120.2, 4);
    expect(coords[0][1]).toBeCloseTo(38.5, 4);
    expect(coords[2][0]).toBeCloseTo(-126.453, 3);
    expect(coords[2][1]).toBeCloseTo(43.252, 3);
  });

  it("formats route distances and durations in Finnish", () => {
    expect(formatRouteDistance(420)).toBe("420 m");
    expect(formatRouteDistance(12_340)).toBe("12.3 km");
    expect(formatRouteDuration(45)).toBe("1 min");
    expect(formatRouteDuration(5_400)).toBe("1 h 30 min");
    expect(formatRouteDuration(7_200)).toBe("2 h");
  });
});
