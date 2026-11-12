import { describe, expect, it } from "vitest";
import { toEtrs } from "../projections";

describe("projections", () => {
  it("converts Helsinki WGS84 coordinates into EPSG:3067 ETRS-TM35FIN", () => {
    const [easting, northing] = toEtrs([24.9384, 60.1699]);
    expect(easting).toBeGreaterThan(385_000);
    expect(easting).toBeLessThan(386_500);
    expect(northing).toBeGreaterThan(6_671_000);
    expect(northing).toBeLessThan(6_673_000);
  });
});
