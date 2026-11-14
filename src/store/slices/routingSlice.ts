import type { MapSlice, MapState } from "./storeTypes";

export type RoutingSlice = Pick<
  MapState,
  | "routePoints"
  | "routeMode"
  | "routeResult"
  | "routePickTarget"
  | "setRoutePoint"
  | "addRouteWaypoint"
  | "removeRoutePoint"
  | "swapRoutePoints"
  | "clearRoute"
>;

export const createRoutingSlice: MapSlice<RoutingSlice> = (set, get) => ({
  routePoints: [null, null],
  routeMode: "auto",
  routeResult: null,
  routePickTarget: 0,

  setRoutePoint: (index, point) => {
    const next = [...get().routePoints];
    if (index >= 0 && index < next.length) {
      next[index] = point;
    }
    const nextEmpty = next.findIndex((p) => p === null);
    set({
      routePoints: next,
      routePickTarget: nextEmpty >= 0 ? nextEmpty : null,
    });
  },
  addRouteWaypoint: () => {
    const next = [...get().routePoints];
    // Lisätään välietappi ennen määränpäätä (viimeistä pistettä)
    const insertAt = Math.max(1, next.length - 1);
    next.splice(insertAt, 0, null);
    set({ routePoints: next, routePickTarget: insertAt });
  },
  removeRoutePoint: (index) => {
    const current = get().routePoints;
    if (current.length <= 2) {
      const next = [...current];
      next[index] = null;
      set({ routePoints: next, routeResult: null, routePickTarget: index });
      return;
    }
    const next = current.filter((_, i) => i !== index);
    set({ routePoints: next, routePickTarget: null });
  },
  swapRoutePoints: () => {
    const next = [...get().routePoints].reverse();
    set({ routePoints: next });
  },
  clearRoute: () => set({ routePoints: [null, null], routeResult: null, routePickTarget: 0 }),
});
