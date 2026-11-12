export type DebugCategory =
  | "map"
  | "coordinates"
  | "layers"
  | "tiles"
  | "network"
  | "performance"
  | "application"
  | "events"
  | "resources";

export type DebugPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface DebugSettings {
  enabled: boolean;
  position: DebugPosition;
  customPosition?: { left: number; top: number } | null;
  opacity: number;
  fontSize: "small" | "medium";
  compactMode: boolean;
  categories: Record<DebugCategory, boolean>;
  values: Record<string, boolean>;
}

export type DebugValue = number | string | boolean | null;
export type DebugSnapshot = Record<string, DebugValue>;

export interface DebugEvent {
  timestamp: number;
  severity: "info" | "warning" | "error";
  source: string;
  message: string;
}

export const DEBUG_CATEGORIES: { id: DebugCategory; label: string; description: string }[] = [
  { id: "map", label: "Map", description: "Karttanäkymän tila" },
  { id: "coordinates", label: "Coordinates", description: "Koordinaatit ja projektiot" },
  { id: "layers", label: "Layers", description: "Karttatasojen yhteenveto" },
  { id: "tiles", label: "Tile loading", description: "Karttaruutujen lataus" },
  { id: "network", label: "Network", description: "Verkkopyyntöjen yhteenveto" },
  { id: "performance", label: "Performance", description: "Ruudunpäivityksen suorituskyky" },
  { id: "application", label: "Application", description: "Sovelluksen perustiedot" },
  { id: "events", label: "Errors & events", description: "Viimeisimmät debug-tapahtumat" },
  { id: "resources", label: "Memory & resources", description: "Saatavilla olevat resurssimittarit" },
];

export const DEBUG_VALUES: Record<DebugCategory, { id: string; label: string }[]> = {
  map: [
    { id: "map.zoom", label: "Zoom level" },
    { id: "map.resolution", label: "Resolution" },
    { id: "map.viewport", label: "Viewport" },
    { id: "map.center", label: "View center" },
    { id: "map.interacting", label: "View is interacting" },
  ],
  coordinates: [
    { id: "coordinates.centerWgs84", label: "Center in WGS84" },
    { id: "coordinates.pointerWgs84", label: "Pointer in WGS84" },
    { id: "coordinates.projection", label: "View projection" },
  ],
  layers: [
    { id: "layers.total", label: "Karttatasot (yhteensä)" },
    { id: "layers.visible", label: "Näkyvät tasot" },
    { id: "layers.base", label: "Aktiivinen pohjakartta" },
    { id: "layers.overlays", label: "Aktiiviset päällyskartat" },
  ],
  tiles: [
    { id: "tiles.loaded", label: "Ladatut tiilet" },
    { id: "tiles.loading", label: "Latautumassa olevat tiilet" },
    { id: "tiles.failed", label: "Epäonnistuneet tiilet" },
    { id: "tiles.successRate", label: "Tiilien onnistumisprosentti" },
  ],
  network: [
    { id: "network.active", label: "Aktiiviset pyynnöt (tiilet + API)" },
    { id: "network.completed", label: "Valmistuneet pyynnöt" },
    { id: "network.failed", label: "Epäonnistuneet pyynnöt" },
  ],
  performance: [
    { id: "performance.fps", label: "Current FPS" },
    { id: "performance.frameTime", label: "Frame time" },
  ],
  application: [
    { id: "application.environment", label: "Environment" },
    { id: "application.viewport", label: "Window size" },
    { id: "application.pixelRatio", label: "Device pixel ratio" },
  ],
  events: [
    { id: "events.errors", label: "Total errors" },
    { id: "events.warnings", label: "Total warnings" },
    { id: "events.recent", label: "Recent events" },
  ],
  resources: [
    { id: "resources.jsHeap", label: "Used JS heap" },
  ],
};

const defaultValues = Object.fromEntries(
  Object.values(DEBUG_VALUES).flat().map(({ id }) => [id, true]),
);

export const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
  enabled: false,
  position: "top-left",
  opacity: 0.85,
  fontSize: "small",
  compactMode: false,
  categories: {
    map: true,
    coordinates: true,
    layers: true,
    tiles: true,
    network: true,
    performance: true,
    application: false,
    events: true,
    resources: false,
  },
  values: defaultValues,
};

export function parseDebugSettings(raw: string | undefined): DebugSettings {
  if (!raw) return DEFAULT_DEBUG_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<DebugSettings>;
    const cp = parsed.customPosition;
    const validCustomPos =
      cp && typeof cp.left === "number" && Number.isFinite(cp.left) && typeof cp.top === "number" && Number.isFinite(cp.top)
        ? { left: cp.left, top: cp.top }
        : null;
    return {
      ...DEFAULT_DEBUG_SETTINGS,
      ...parsed,
      customPosition: validCustomPos,
      categories: { ...DEFAULT_DEBUG_SETTINGS.categories, ...(parsed.categories ?? {}) },
      values: { ...DEFAULT_DEBUG_SETTINGS.values, ...(parsed.values ?? {}) },
    };
  } catch {
    return DEFAULT_DEBUG_SETTINGS;
  }
}
