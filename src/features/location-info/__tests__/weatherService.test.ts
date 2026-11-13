import { describe, expect, it } from "vitest";
import { FORECAST_DAYS } from "../weatherService";

describe("weatherService", () => {
  it("uses 5 forecast days by default to match OpenWeatherMap free tier", () => {
    expect(FORECAST_DAYS).toBe(5);
  });
});
