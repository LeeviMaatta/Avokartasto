import { describe, expect, it } from "vitest";
import { formatArea, formatDistance } from "../measurementFormatting";

describe("measurementFormatting", () => {
  it("formats area in auto and explicit units", () => {
    expect(formatArea(450, "auto")).toBe("450 m²");
    expect(formatArea(25_000, "auto")).toBe("2.50 ha");
    expect(formatArea(2_500_000, "auto")).toBe("2.50 km²");
    expect(formatArea(5_000, "ha")).toBe("0.50 ha");
    expect(formatArea(500_000, "km2")).toBe("0.500 km²");
  });

  it("formats distance in metric and imperial units", () => {
    expect(formatDistance(850, "metric")).toBe("850 m");
    expect(formatDistance(2_500, "metric")).toBe("2.50 km");
    expect(formatDistance(100, "imperial")).toBe("328 ft");
    expect(formatDistance(3_218.688, "imperial")).toBe("2.00 mi");
  });
});
