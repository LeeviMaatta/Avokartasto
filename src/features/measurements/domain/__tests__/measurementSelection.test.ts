import { describe, expect, it } from "vitest";
import {
  addMeasurementLink,
  getLinkedMeasurementGroup,
  mergeMeasurementSelection,
  parseMeasurementLinkKey,
  removeMeasurementFromLinks,
  toMeasurementLinkKey,
  toggleMeasurementInSelection,
  updateMeasurementItemInSelection,
} from "../measurementSelection";
import {
  findClosestEndpointCandidate,
  isClickWithoutDrag,
} from "../measurementEndpointAction";

describe("measurementSelection & endpoint actions", () => {
  it("toggles and updates saved and unsaved measurements in multi-selection", () => {
    const m1 = { savedId: null, unsavedId: "unsaved-1", length: 500, kind: "distance" as const };
    const m2 = { savedId: 12, unsavedId: null, length: 900, kind: "distance" as const, title: "Reitti" };

    let sel = toggleMeasurementInSelection([], m1);
    expect(sel).toHaveLength(1);
    sel = toggleMeasurementInSelection(sel, m2);
    expect(sel).toHaveLength(2);

    sel = updateMeasurementItemInSelection(sel, { ...m1, length: 650 });
    expect(sel.find((item) => item.unsavedId === "unsaved-1")?.length).toBe(650);

    sel = toggleMeasurementInSelection(sel, m1);
    expect(sel).toEqual([m2]);
  });

  it("links, queries, and unlinks session measurement pairs", () => {
    let links = addMeasurementLink({}, "unsaved-1", "unsaved-2");
    expect(getLinkedMeasurementGroup(links, "unsaved-1")).toEqual(["unsaved-1", "unsaved-2"]);
    expect(getLinkedMeasurementGroup(links, "unsaved-2")).toEqual(["unsaved-2", "unsaved-1"]);

    links = removeMeasurementFromLinks(links, "unsaved-1");
    expect(getLinkedMeasurementGroup(links, "unsaved-2")).toEqual(["unsaved-2"]);
  });

  it("distinguishes endpoint clicks without drag and finds the closest vertex", () => {
    expect(isClickWithoutDrag([100, 100], [103, 104], 5)).toBe(true);
    expect(isClickWithoutDrag([100, 100], [110, 100], 5)).toBe(false);

    const best = findClosestEndpointCandidate(
      [
        { pixel: [50, 50], coord: [1, 1], unsavedId: "unsaved-1", savedId: null, distancePx: Infinity },
        { pixel: [200, 200], coord: [2, 2], unsavedId: "unsaved-1", savedId: null, distancePx: Infinity },
      ],
      [204, 198],
      12,
    );
    expect(best?.coord).toEqual([2, 2]);
    expect(findClosestEndpointCandidate([], [204, 198], 12)).toBeNull();
  });

  it("merges junction measurements without duplicating already selected items", () => {
    const m1 = { savedId: null, unsavedId: "unsaved-1", length: 500, kind: "distance" as const };
    const m2 = { savedId: null, unsavedId: "unsaved-2", length: 700, kind: "distance" as const };
    const merged = mergeMeasurementSelection([m1], [m1, m2]);
    expect(merged).toEqual([m1, m2]);
    expect(mergeMeasurementSelection([m1, m2], [m1])).toEqual([m1, m2]);
  });

  it("formats and parses canonical link keys for saved and unsaved measurements", () => {
    expect(toMeasurementLinkKey({ savedId: 42, unsavedId: null })).toBe("saved:42");
    expect(toMeasurementLinkKey({ savedId: null, unsavedId: "unsaved-7" })).toBe("unsaved-7");
    expect(toMeasurementLinkKey({ savedId: null, unsavedId: null })).toBeNull();

    expect(parseMeasurementLinkKey("saved:42")).toEqual({ savedId: 42, unsavedId: null });
    expect(parseMeasurementLinkKey("unsaved-7")).toEqual({ savedId: null, unsavedId: "unsaved-7" });
    expect(parseMeasurementLinkKey("saved:abc")).toBeNull();
    expect(parseMeasurementLinkKey("")).toBeNull();

    let links: Record<string, string[]> = {};
    links = addMeasurementLink(links, "saved:42", "unsaved-7");
    expect(getLinkedMeasurementGroup(links, "saved:42")).toEqual(["saved:42", "unsaved-7"]);
    expect(getLinkedMeasurementGroup(links, "unsaved-7")).toEqual(["unsaved-7", "saved:42"]);
  });
});
