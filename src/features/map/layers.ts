import TileLayer from "ol/layer/Tile";
import TileGrid from "ol/tilegrid/TileGrid";
import { get as getProjection } from "ol/proj";
import type { LocalSource } from "../../infrastructure/tauriBridge";
import type { LayerCopy } from "../../store/mapStore";
import { BASEMAPS } from "./catalog/basemaps";
import { OVERLAYS } from "./catalog/overlays";
import { createLocalLayer } from "./catalog/layerProviders";

export { BASEMAPS, OVERLAYS } from "./catalog";

type Settings = Record<string, string>;
type LayerViewSettings = { zoomOffset: number; magnification: number };

const getLayerViewSettings = (id: string, settings: Settings): LayerViewSettings => {
  try {
    const parsed = JSON.parse(settings.layerViewSettings ?? "{}") as Record<string, Partial<LayerViewSettings>>;
    const value = parsed[id];
    return {
      zoomOffset: Number.isFinite(value?.zoomOffset) ? Math.max(-8, Math.min(8, value.zoomOffset!)) : 0,
      magnification: value?.magnification === 2 || value?.magnification === 4 ? value.magnification : 1,
    };
  } catch {
    return { zoomOffset: 0, magnification: 1 };
  }
};

const applyLayerViewSettings = (layer: TileLayer<any>, id: string, settings: Settings) => {
  const view = getLayerViewSettings(id, settings);
  const source = layer.getSource();
  const projection = getProjection("EPSG:3857");
  if (!source || !projection) return layer;
  const tileGrid = source.getTileGridForProjection(projection);
  const maxZoom = tileGrid?.getResolutions().length ? tileGrid.getResolutions().length - 1 : 19;
  const effectiveOffset = view.zoomOffset - Math.log2(view.magnification);
  const initialResolution = 156543.03392804097;
  const resolutions = Array.from({ length: maxZoom + 1 }, (_, z) => initialResolution / (2 ** (z + effectiveOffset)));
  source.setTileGridForProjection(
    projection,
    new TileGrid({
      origin: [-20037508.342789244, 20037508.342789244],
      resolutions,
      tileSize: 256,
    }),
  );
  return layer;
};

export const LAYER_CATALOG = { basemaps: BASEMAPS, overlays: OVERLAYS } as const;

export function buildLayer(id: string, settings: Settings, sources: LocalSource[], overlay: boolean): TileLayer<any> | null {
  if (id.startsWith("copy:")) {
    let copies: LayerCopy[] = [];
    try {
      const parsed = JSON.parse(settings.layerCopies ?? "[]");
      if (Array.isArray(parsed)) copies = parsed;
    } catch {
      copies = [];
    }
    const copy = copies.find((item) => `copy:${item.id}` === id);
    if (!copy) return null;
    const sourceIsOverlay = OVERLAYS.some((layer) => layer.id === copy.sourceId);
    const copied = buildLayer(copy.sourceId, settings, sources, sourceIsOverlay);
    if (!copied) return null;
    copied.setOpacity(copy.opacity);
    return applyLayerViewSettings(copied, id, settings);
  }
  if (id.startsWith("local:")) {
    const source = sources.find((item) => `local:${item.id}` === id);
    if (!source || (overlay && source.role !== "overlay") || (!overlay && source.role !== "basemap")) return null;
    return applyLayerViewSettings(createLocalLayer(source), id, settings);
  }
  const definition = LAYER_CATALOG[overlay ? "overlays" : "basemaps"].find((item) => item.id === id);
  if (!definition || (definition.needs && !settings[definition.needs])) return null;
  const layer = definition.create(settings);
  if (overlay && !id.startsWith("local:")) layer.setOpacity(0.9);
  return applyLayerViewSettings(layer, id, settings);
}
