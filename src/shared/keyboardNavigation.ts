import type { KeyboardEvent as ReactKeyboardEvent } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="menuitem"], [tabindex]:not([tabindex="-1"])';

export function focusMapViewport(): void {
  const viewport = document.querySelector<HTMLElement>('[data-map-viewport="true"]');
  viewport?.focus({ preventScroll: true });
}

export function isElementVisible(el: HTMLElement): boolean {
  if (el.getAttribute("aria-hidden") === "true" || el.dataset.kbIgnore === "true") return false;
  if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function getNavigableItems(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isElementVisible);
}

export function focusFirstNavigable(container: HTMLElement | null): boolean {
  if (!container) return false;
  const items = getNavigableItems(container);
  if (items.length === 0) return false;
  items[0].focus({ preventScroll: true });
  return true;
}

function isInputTakingArrows(target: HTMLElement): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    const type = (target.type || "text").toLowerCase();
    return type !== "checkbox" && type !== "radio" && type !== "button" && type !== "submit" && type !== "reset";
  }
  return false;
}

export interface ArrowNavOptions {
  orientation?: "vertical" | "horizontal" | "both";
  loop?: boolean;
  onEscape?: () => void;
}

/**
 * Yhtenäinen nuolinäppäinnavigointi valikoille, paneeleille ja työkalupalkeille.
 * Tukee lisäksi rivikohtaista vaakaliikkumista `[data-kb-row]`-elementeissä
 * sekä `aria-expanded`-ryhmien ja -kansioiden avaamista/sulkemista Vasen/Oikea-nuolilla.
 */
export function handleContainerArrowKeyDown(
  event: ReactKeyboardEvent<HTMLElement>,
  options: ArrowNavOptions = {},
): void {
  if (event.defaultPrevented) return;
  const { orientation = "vertical", loop = true, onEscape } = options;
  const container = event.currentTarget;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (!active || !container.contains(active)) return;

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    if (onEscape) onEscape();
    else focusMapViewport();
    return;
  }

  if (
    event.key === "Enter" &&
    active instanceof HTMLInputElement &&
    (active.type === "checkbox" || active.type === "radio")
  ) {
    event.preventDefault();
    active.click();
    return;
  }

  if (isInputTakingArrows(active)) return;

  const isPrev =
    (orientation === "vertical" && event.key === "ArrowUp") ||
    (orientation === "horizontal" && event.key === "ArrowLeft") ||
    (orientation === "both" && (event.key === "ArrowUp" || event.key === "ArrowLeft"));
  const isNext =
    (orientation === "vertical" && event.key === "ArrowDown") ||
    (orientation === "horizontal" && event.key === "ArrowRight") ||
    (orientation === "both" && (event.key === "ArrowDown" || event.key === "ArrowRight"));

  // Pystylistassa [data-kb-row]-rivin sisällä Vasen/Oikea liikkuu rivin painikkeiden välillä
  // tai avaa/sulkee [aria-expanded]-ryhmän.
  if (orientation === "vertical" && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
    const expanded = active.getAttribute("aria-expanded");
    if (expanded === "false" && event.key === "ArrowRight") {
      event.preventDefault();
      active.click();
      return;
    }
    if (expanded === "true" && event.key === "ArrowLeft") {
      event.preventDefault();
      active.click();
      return;
    }
    const row = active.closest<HTMLElement>("[data-kb-row]");
    if (row && container.contains(row)) {
      const rowItems = getNavigableItems(row);
      const idx = rowItems.indexOf(active);
      if (idx >= 0) {
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const target = rowItems[idx + delta];
        if (target) {
          event.preventDefault();
          target.focus({ preventScroll: true });
          return;
        }
      }
    }
  }

  const allItems = getNavigableItems(container);
  if (allItems.length === 0) return;

  if (event.key === "Home") {
    event.preventDefault();
    allItems[0].focus({ preventScroll: true });
    return;
  }
  if (event.key === "End") {
    event.preventDefault();
    allItems[allItems.length - 1].focus({ preventScroll: true });
    return;
  }

  if (!isPrev && !isNext) return;

  // Rivipohjaisissa listoissa Ylös/Alas hyppää seuraavan rivin ensisijaiseen elementtiin
  const currentRow = orientation === "vertical" ? active.closest<HTMLElement>("[data-kb-row]") : null;
  let items = allItems;
  if (currentRow && container.contains(currentRow)) {
    const primaryPerRow = new Set<HTMLElement>();
    const seenRows = new Set<HTMLElement>();
    for (const item of allItems) {
      const row = item.closest<HTMLElement>("[data-kb-row]");
      if (row && container.contains(row)) {
        if (!seenRows.has(row)) {
          seenRows.add(row);
          primaryPerRow.add(row === currentRow ? active : item);
        }
      } else {
        primaryPerRow.add(item);
      }
    }
    items = allItems.filter((item) => primaryPerRow.has(item));
  }

  const index = items.indexOf(active);
  if (index < 0) return;

  event.preventDefault();
  const delta = isNext ? 1 : -1;
  let nextIndex = index + delta;
  if (loop) {
    nextIndex = (nextIndex + items.length) % items.length;
  } else {
    nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
  }
  items[nextIndex]?.focus({ preventScroll: true });
}
