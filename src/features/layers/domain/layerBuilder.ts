import TileGrid from "ol/tilegrid/TileGrid";
import { get as getProjection } from "ol/proj";
import type BaseLayer from "ol/layer/Base";
import TileLayer from "ol/layer/Tile";
import VectorTileLayer from "ol/layer/VectorTile";
import type { LocalSource } from "../../../infrastructure/tauri";
import { buildSourceLayer } from "../../map/services/registry";

type Settings = Record<string, string>;

const applyLayerViewSettings = (layer: BaseLayer, source: LocalSource, maxZoomCap?: number): BaseLayer => {
  const tileSource = layer instanceof TileLayer || layer instanceof VectorTileLayer ? layer.getSource() : null;
  if (!tileSource || !("getTileGridForProjection" in tileSource)) return layer;
  const projection = getProjection("EPSG:3857");
  if (!projection) return layer;
  const tileGrid = tileSource.getTileGridForProjection(projection);
  const rawMaxZoom = tileGrid?.getResolutions().length ? tileGrid.getResolutions().length - 1 : source.max_zoom;
  const maxZoom = maxZoomCap !== undefined ? Math.min(rawMaxZoom, maxZoomCap) : rawMaxZoom;
  const magnification = source.view_magnification > 0 ? source.view_magnification : 1;
  const effectiveOffset = (source.view_zoom_offset || 0) - Math.log2(magnification);
  const initialResolution = 156543.03392804097;
  const resolutions = Array.from({ length: maxZoom + 1 }, (_, z) => initialResolution / (2 ** (z + effectiveOffset)));
  tileSource.setTileGridForProjection(projection, new TileGrid({
    origin: [-20037508.342789244, 20037508.342789244],
    resolutions,
    tileSize: source.tile_size || 256,
  }));
  return layer;
};

export function sourceId(id: string): number | null {
  const match = id.match(/^src:(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function buildLayer(id: string, settings: Settings, sources: LocalSource[], overlay: boolean): BaseLayer | null {
  const numericId = sourceId(id);
  if (numericId === null) return null;
  const source = sources.find((item) => item.id === numericId);
  if (!source || (overlay && source.role !== "overlay") || (!overlay && source.role !== "basemap")) return null;
  const layer = buildSourceLayer(source, settings);
  return layer ? applyLayerViewSettings(layer, source) : null;
}

/** Builds a background fallback layer capped at `maxZoomCap` so high-zoom panning reuses cached lower-zoom tiles. */
export function buildBackdropLayer(
  id: string,
  settings: Settings,
  sources: LocalSource[],
  maxZoomCap = 14,
): BaseLayer | null {
  const numericId = sourceId(id);
  if (numericId === null) return null;
  const source = sources.find((item) => item.id === numericId);
  if (!source) return null;
  const layer = buildSourceLayer(source, settings, {
    maxZoomCap,
    cacheSize: settings.tileCache === "0" ? 0 : 1024,
  });
  return layer ? applyLayerViewSettings(layer, source, maxZoomCap) : null;
}
