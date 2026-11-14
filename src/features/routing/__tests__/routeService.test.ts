import VectorSource from "ol/source/Vector";
import { describe, expect, it, vi } from "vitest";
import { syncRouteFeaturesToSource } from "../../map/hooks/mapLayerSyncHelpers";
import {
  handleRouteInputDropdownKey,
  handleRouteListDropdownKey,
  type RouteDropdownKeyTarget,
} from "../domain/routeDropdownNav";
import {
  decodePolyline,
  formatRouteDistance,
  formatRouteDuration,
  type RoutePoint,
  type RouteResult,
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

  it("hides route features when route tool is closed and restores them when reopened", () => {
    const source = new VectorSource();
    const points: RoutePoint[] = [
      { coord: [24.9384, 60.1699], label: "Helsinki" },
      { coord: [23.761, 61.4978], label: "Tampere" },
    ];
    const result: RouteResult = {
      coordinates: [
        [24.9384, 60.1699],
        [24.5, 60.8],
        [23.761, 61.4978],
      ],
      distance: 178_000,
      duration: 7_200,
      steps: [],
      mode: "auto",
      provider: "Valhalla",
    };

    syncRouteFeaturesToSource(null, source, points, result, true);
    expect(source.getFeatures()).toHaveLength(3);

    syncRouteFeaturesToSource(null, source, points, result, false);
    expect(source.getFeatures()).toHaveLength(0);

    syncRouteFeaturesToSource(null, source, points, result, true);
    expect(source.getFeatures()).toHaveLength(3);
  });

  it("navigates route search dropdown items with arrow keys and returns focus to input", () => {
    const makeTarget = (): RouteDropdownKeyTarget & {
      focus: ReturnType<typeof vi.fn>;
      scrollIntoView: ReturnType<typeof vi.fn>;
    } => ({
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    });
    const input = makeTarget();
    const items = [makeTarget(), makeTarget(), makeTarget()];
    const onRunSearch = vi.fn();
    const onCloseDropdown = vi.fn();
    const makeKey = (key: string) => ({
      key,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    // ArrowDown from input enters first result
    const downFromInput = makeKey("ArrowDown");
    expect(
      handleRouteInputDropdownKey(downFromInput, {
        showDropdown: true,
        items,
        onRunSearch,
        onCloseDropdown,
      }),
    ).toBe(true);
    expect(downFromInput.preventDefault).toHaveBeenCalled();
    expect(downFromInput.stopPropagation).toHaveBeenCalled();
    expect(items[0].focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(items[0].scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });

    // ArrowDown inside dropdown moves 0 -> 1 and wraps 2 -> 0
    expect(
      handleRouteListDropdownKey(makeKey("ArrowDown"), {
        items,
        activeIndex: 0,
        input,
        onCloseDropdown,
      }),
    ).toBe(true);
    expect(items[1].focus).toHaveBeenCalledWith({ preventScroll: true });

    expect(
      handleRouteListDropdownKey(makeKey("ArrowDown"), {
        items,
        activeIndex: 2,
        input,
        onCloseDropdown,
      }),
    ).toBe(true);
    expect(items[0].focus).toHaveBeenCalledTimes(2);

    // ArrowUp on item 1 moves 1 -> 0; ArrowUp on item 0 returns focus to input
    expect(
      handleRouteListDropdownKey(makeKey("ArrowUp"), {
        items,
        activeIndex: 1,
        input,
        onCloseDropdown,
      }),
    ).toBe(true);
    expect(items[0].focus).toHaveBeenCalledTimes(3);

    expect(
      handleRouteListDropdownKey(makeKey("ArrowUp"), {
        items,
        activeIndex: 0,
        input,
        onCloseDropdown,
      }),
    ).toBe(true);
    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });

    // Escape closes dropdown and focuses input
    const esc = makeKey("Escape");
    expect(
      handleRouteListDropdownKey(esc, {
        items,
        activeIndex: 1,
        input,
        onCloseDropdown,
      }),
    ).toBe(true);
    expect(onCloseDropdown).toHaveBeenCalledTimes(1);
    expect(input.focus).toHaveBeenCalledTimes(2);
  });
});
