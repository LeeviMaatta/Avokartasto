import { describe, expect, it } from "vitest";
import { shouldFocusMapOnWheel, shouldRestoreMapFocusAfterClick } from "../mapFocus";

describe("shouldRestoreMapFocusAfterClick", () => {
  const base = {
    isPointerClick: true,
    targetInsideMap: false,
    hasOpenModal: false,
    hasActiveSelection: false,
    activeTagName: "BUTTON",
    activeInputType: null,
    activeIsContentEditable: false,
    activeInMenuPopup: false,
  };

  it("restores focus to the map after clicking a menu button or checkbox", () => {
    expect(shouldRestoreMapFocusAfterClick(base)).toBe(true);
    expect(
      shouldRestoreMapFocusAfterClick({
        ...base,
        activeTagName: "INPUT",
        activeInputType: "checkbox",
      }),
    ).toBe(true);
    expect(
      shouldRestoreMapFocusAfterClick({
        ...base,
        activeTagName: "INPUT",
        activeInputType: "radio",
      }),
    ).toBe(true);
  });

  it("keeps focus inside menus on keyboard activation (Enter/Space)", () => {
    expect(shouldRestoreMapFocusAfterClick({ ...base, isPointerClick: false })).toBe(false);
  });

  it("keeps focus in text inputs, selects, modals, and open menu popups", () => {
    expect(
      shouldRestoreMapFocusAfterClick({
        ...base,
        activeTagName: "INPUT",
        activeInputType: "text",
      }),
    ).toBe(false);
    expect(
      shouldRestoreMapFocusAfterClick({
        ...base,
        activeTagName: "INPUT",
        activeInputType: "range",
      }),
    ).toBe(false);
    expect(shouldRestoreMapFocusAfterClick({ ...base, activeTagName: "TEXTAREA" })).toBe(false);
    expect(shouldRestoreMapFocusAfterClick({ ...base, activeTagName: "SELECT" })).toBe(false);
    expect(shouldRestoreMapFocusAfterClick({ ...base, hasOpenModal: true })).toBe(false);
    expect(shouldRestoreMapFocusAfterClick({ ...base, activeInMenuPopup: true })).toBe(false);
    expect(shouldRestoreMapFocusAfterClick({ ...base, activeIsContentEditable: true })).toBe(false);
    expect(shouldRestoreMapFocusAfterClick({ ...base, hasActiveSelection: true })).toBe(false);
  });

  it("skips restoration when click target was already inside the map", () => {
    expect(shouldRestoreMapFocusAfterClick({ ...base, targetInsideMap: true })).toBe(false);
  });
});

describe("shouldFocusMapOnWheel", () => {
  it("focuses the map when wheeling directly over the map viewport while focus is elsewhere", () => {
    expect(
      shouldFocusMapOnWheel({
        targetInsideMap: true,
        targetInControlOrEditable: false,
        hasOpenModal: false,
        mapAlreadyFocused: false,
      }),
    ).toBe(true);
  });

  it("does not steal focus when cursor is over a menu, modal is open, or map is already focused", () => {
    expect(
      shouldFocusMapOnWheel({
        targetInsideMap: false,
        targetInControlOrEditable: false,
        hasOpenModal: false,
        mapAlreadyFocused: false,
      }),
    ).toBe(false);
    expect(
      shouldFocusMapOnWheel({
        targetInsideMap: true,
        targetInControlOrEditable: true,
        hasOpenModal: false,
        mapAlreadyFocused: false,
      }),
    ).toBe(false);
    expect(
      shouldFocusMapOnWheel({
        targetInsideMap: true,
        targetInControlOrEditable: false,
        hasOpenModal: true,
        mapAlreadyFocused: false,
      }),
    ).toBe(false);
    expect(
      shouldFocusMapOnWheel({
        targetInsideMap: true,
        targetInControlOrEditable: false,
        hasOpenModal: false,
        mapAlreadyFocused: true,
      }),
    ).toBe(false);
  });
});
