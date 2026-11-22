import { create } from "zustand";
import { createMeasurementSlice } from "./slices/measurementSlice";
import { createRoutingSlice } from "./slices/routingSlice";
import { createSettingsSlice } from "./slices/settingsSlice";
import { createSourcesSlice } from "./slices/sourcesSlice";
import type { MapState } from "./slices/storeTypes";

export type { Tool } from "../features/map/model/mapTypes";

export const useMapStore = create<MapState>((...args) => ({
  ...createSettingsSlice(...args),
  ...createSourcesSlice(...args),
  ...createMeasurementSlice(...args),
  ...createRoutingSlice(...args),
}));
