export interface RouteDropdownKeyTarget {
  focus: (options?: { preventScroll?: boolean }) => void;
  scrollIntoView?: (options?: { block?: "nearest" | "start" | "end" | "center" }) => void;
}

export interface RouteDropdownKeyEvent {
  key: string;
  preventDefault: () => void;
  stopPropagation: () => void;
}

/** Handles ArrowDown/ArrowUp/Enter/Escape on the route search input when its dropdown is open. */
export function handleRouteInputDropdownKey(
  event: RouteDropdownKeyEvent,
  options: {
    showDropdown: boolean;
    items: RouteDropdownKeyTarget[];
    onRunSearch: () => void;
    onCloseDropdown: () => void;
  },
): boolean {
  const { showDropdown, items, onRunSearch, onCloseDropdown } = options;
  if (event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    onRunSearch();
    return true;
  }
  if (!showDropdown) return false;
  if (event.key === "ArrowDown" && items.length > 0) {
    event.preventDefault();
    event.stopPropagation();
    items[0].focus({ preventScroll: true });
    items[0].scrollIntoView?.({ block: "nearest" });
    return true;
  }
  if (event.key === "ArrowUp" && items.length > 0) {
    event.preventDefault();
    event.stopPropagation();
    const last = items[items.length - 1];
    last.focus({ preventScroll: true });
    last.scrollIntoView?.({ block: "nearest" });
    return true;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onCloseDropdown();
    return true;
  }
  return false;
}

/** Handles Arrow/Home/End/Escape navigation inside the route search results dropdown. */
export function handleRouteListDropdownKey(
  event: RouteDropdownKeyEvent,
  options: {
    items: RouteDropdownKeyTarget[];
    activeIndex: number;
    input: RouteDropdownKeyTarget | null;
    onCloseDropdown: () => void;
  },
): boolean {
  const { items, activeIndex, input, onCloseDropdown } = options;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onCloseDropdown();
    input?.focus({ preventScroll: true });
    return true;
  }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }
  if (items.length === 0) return false;

  const focusItem = (idx: number) => {
    const target = items[idx];
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: "nearest" });
  };

  if (event.key === "ArrowDown") {
    event.preventDefault();
    event.stopPropagation();
    focusItem(activeIndex >= 0 ? (activeIndex + 1) % items.length : 0);
    return true;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    event.stopPropagation();
    if (activeIndex <= 0) {
      input?.focus({ preventScroll: true });
    } else {
      focusItem(activeIndex - 1);
    }
    return true;
  }
  if (event.key === "Home") {
    event.preventDefault();
    event.stopPropagation();
    focusItem(0);
    return true;
  }
  if (event.key === "End") {
    event.preventDefault();
    event.stopPropagation();
    focusItem(items.length - 1);
    return true;
  }
  return false;
}
