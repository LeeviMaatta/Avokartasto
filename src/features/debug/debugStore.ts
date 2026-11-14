import { create } from "zustand";
import * as bridge from "../../infrastructure/tauriBridge";
import {
  DEFAULT_DEBUG_SETTINGS,
  parseDebugSettings,
  type DebugEvent,
  type DebugSettings,
  type DebugSnapshot,
} from "./model/debugTypes";

const MAX_EVENTS = 200;

interface DebugState {
  settings: DebugSettings;
  snapshot: DebugSnapshot;
  events: DebugEvent[];
  load: (raw: string | undefined) => void;
  updateSettings: (settings: DebugSettings) => Promise<void>;
  reset: () => Promise<void>;
  refresh: (snapshot: DebugSnapshot) => void;
  record: (event: Omit<DebugEvent, "timestamp">) => void;
}

export const useDebugStore = create<DebugState>((set, get) => ({
  settings: DEFAULT_DEBUG_SETTINGS,
  snapshot: {},
  events: [],
  load: (raw) => set({ settings: parseDebugSettings(raw) }),
  updateSettings: async (settings) => {
    await bridge.setSetting("debugSettings", JSON.stringify(settings));
    set({ settings });
  },
  reset: async () => {
    await bridge.setSetting("debugSettings", JSON.stringify(DEFAULT_DEBUG_SETTINGS));
    set({ settings: DEFAULT_DEBUG_SETTINGS });
  },
  refresh: (snapshot) => set({ snapshot }),
  record: (event) => {
    const events = [...get().events, { ...event, timestamp: Date.now() }].slice(-MAX_EVENTS);
    set({ events });
  },
}));
