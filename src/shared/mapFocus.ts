import { focusMapViewport } from "./keyboardNavigation";

const NON_TEXT_INPUT_TYPES = new Set(["button", "submit", "reset", "checkbox", "radio"]);
const POINTER_CLICK_WINDOW_MS = 1000;

export interface FocusRestoreCheckInput {
  isPointerClick: boolean;
  targetInsideMap: boolean;
  hasOpenModal: boolean;
  hasActiveSelection?: boolean;
  activeTagName: string | null;
  activeInputType: string | null;
  activeIsContentEditable: boolean;
  activeInMenuPopup: boolean;
}

export interface WheelFocusCheckInput {
  targetInsideMap: boolean;
  targetInControlOrEditable: boolean;
  hasOpenModal: boolean;
  mapAlreadyFocused: boolean;
}

/**
 * Palauttaa `true`, kun valikon tai työkalupaneelin hiiriklikkauksen jälkeen
 * focus tulee palauttaa karttanäkymälle. Tekstikentät, modaalit ja avoimet
 * ponnahdusvalikot sekä näppäimistönavigointi säilyttävät focuksensa.
 */
export function shouldRestoreMapFocusAfterClick(input: FocusRestoreCheckInput): boolean {
  if (!input.isPointerClick || input.targetInsideMap || input.hasOpenModal) return false;
  if (input.hasActiveSelection || input.activeInMenuPopup || input.activeIsContentEditable) return false;
  if (input.activeTagName === "TEXTAREA" || input.activeTagName === "SELECT") return false;
  if (input.activeTagName === "INPUT" && !NON_TEXT_INPUT_TYPES.has((input.activeInputType || "text").toLowerCase())) {
    return false;
  }
  return true;
}

/**
 * Palauttaa `true`, kun kartan päällä tapahtuva rullaustapahtuma vaatii focuksen
 * siirtämisen karttanäkymälle.
 */
export function shouldFocusMapOnWheel(input: WheelFocusCheckInput): boolean {
  if (!input.targetInsideMap || input.targetInControlOrEditable || input.hasOpenModal) return false;
  return !input.mapAlreadyFocused;
}

function resolveTargetElement(target: EventTarget | null): HTMLElement | null {
  if (typeof HTMLElement !== "undefined" && target instanceof HTMLElement) return target;
  if (typeof Node !== "undefined" && target instanceof Node) return target.parentElement;
  return null;
}

/**
 * Palauttaa focuksen kartalle aina valikkoklikkausten jälkeen (ellei focus siirtynyt
 * syöttökenttään, alivalikkoon tai modaaliin) sekä rullattaessa kartan päällä.
 */
export function attachMapFocusRestoration(doc: Document = document): () => void {
  if (typeof window === "undefined") return () => {};

  let lastPointerDownAt = 0;
  let scheduledRaf: number | null = null;
  let scheduledTimer: number | null = null;

  const cancelScheduled = () => {
    if (scheduledRaf !== null) {
      window.cancelAnimationFrame(scheduledRaf);
      scheduledRaf = null;
    }
    if (scheduledTimer !== null) {
      window.clearTimeout(scheduledTimer);
      scheduledTimer = null;
    }
  };

  const scheduleRestoreCheck = (targetInsideMap: boolean, targetEl: HTMLElement | null) => {
    cancelScheduled();
    // Ajetaan rAF:n ja seuraavan tehtävän jälkeen, jotta Reactin renderöinti
    // sekä komponenttien omat autoFocus/focusFirstNavigable-kutsut ehtivät ensin.
    scheduledRaf = window.requestAnimationFrame(() => {
      scheduledRaf = null;
      scheduledTimer = window.setTimeout(() => {
        scheduledTimer = null;
        const active = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
        const selection = window.getSelection();
        const hasActiveSelection = Boolean(
          selection &&
            !selection.isCollapsed &&
            selection.toString().length > 0 &&
            selection.anchorNode &&
            targetEl &&
            (targetEl.contains(selection.anchorNode) || selection.anchorNode.contains(targetEl)),
        );
        const shouldRestore = shouldRestoreMapFocusAfterClick({
          isPointerClick: true,
          targetInsideMap,
          hasOpenModal: Boolean(doc.querySelector('[aria-modal="true"]')),
          hasActiveSelection,
          activeTagName: active ? active.tagName.toUpperCase() : null,
          activeInputType: active instanceof HTMLInputElement ? active.type : null,
          activeIsContentEditable: Boolean(active?.isContentEditable),
          activeInMenuPopup: Boolean(active?.closest('[role="menu"], [role="listbox"], [data-feature-context-menu]')),
        });
        if (shouldRestore) {
          focusMapViewport();
        }
      }, 0);
    });
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    lastPointerDownAt = performance.now();
  };

  const onKeyDown = () => {
    lastPointerDownAt = 0;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (lastPointerDownAt === 0 || performance.now() - lastPointerDownAt > POINTER_CLICK_WINDOW_MS) return;
    const mapViewport = doc.querySelector<HTMLElement>('[data-map-viewport="true"]');
    const targetEl = resolveTargetElement(event.target);
    const targetInsideMap = Boolean(mapViewport && targetEl && mapViewport.contains(targetEl));
    scheduleRestoreCheck(targetInsideMap, targetEl);
  };

  const onClick = (event: MouseEvent) => {
    const recentPointer = lastPointerDownAt > 0 && performance.now() - lastPointerDownAt <= POINTER_CLICK_WINDOW_MS;
    const isPointerClick = event.detail > 0 || recentPointer;
    lastPointerDownAt = 0;
    if (!isPointerClick) return;
    const mapViewport = doc.querySelector<HTMLElement>('[data-map-viewport="true"]');
    const targetEl = resolveTargetElement(event.target);
    const targetInsideMap = Boolean(mapViewport && targetEl && mapViewport.contains(targetEl));
    scheduleRestoreCheck(targetInsideMap, targetEl);
  };

  doc.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("pointerup", onPointerUp, true);
  doc.addEventListener("click", onClick, true);
  doc.addEventListener("keydown", onKeyDown, true);

  return () => {
    cancelScheduled();
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("pointerup", onPointerUp, true);
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("keydown", onKeyDown, true);
  };
}
