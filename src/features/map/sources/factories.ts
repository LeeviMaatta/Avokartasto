import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import ImageLayer from "ol/layer/Image";
import ImageStatic from "ol/source/ImageStatic";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import VectorTileLayer from "ol/layer/VectorTile";
import VectorTileSource from "ol/source/VectorTile";
import MVT from "ol/format/MVT";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import GPX from "ol/format/GPX";
import KML from "ol/format/KML";
import { tileUrl, remoteTileUrl } from "../../../infrastructure/tauriBridge";
import type { MapSource, SourceFactory } from "./model/sourceTypes";
import { resolveSourceUrl } from "./resolveUrl";

const paramsOf = (source: MapSource): Record<string, unknown> => {
  try {
    const value = JSON.parse(source.params || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
};

const remoteUrl = (source: MapSource, settings: Record<string, string>) =>
  resolveSourceUrl(source.url || source.base_path, settings);

const rasterUrl = (source: MapSource, settings: Record<string, string>) => {
  const auth = source.auth || "";
  return auth && source.id > 0 ? remoteTileUrl(source.id) : remoteUrl(source, settings);
};

const xyz: SourceFactory = (source, settings) => new TileLayer({
  source: new XYZ({
    url: rasterUrl(source, settings),
    attributions: source.attribution || source.name,
    maxZoom: source.max_zoom,
    minZoom: source.min_zoom,
    tileSize: source.tile_size,
    crossOrigin: "anonymous",
  }),
});

const wms: SourceFactory = (source, settings) => {
  const params = paramsOf(source);
  return new TileLayer({
    source: new TileWMS({
      url: remoteUrl(source, settings),
      params: {
        LAYERS: params.layers || source.layer_name,
        STYLES: params.styles || source.style,
        FORMAT: params.format || "image/png",
        VERSION: params.version || "1.3.0",
        TILED: params.tiled ?? true,
        TRANSPARENT: params.transparent ?? true,
      },
      attributions: source.attribution || source.name,
      crossOrigin: "anonymous",
    }),
  });
};

const wmts: SourceFactory = (source, settings) => xyz(source, settings);

const localTile: SourceFactory = (source) => new TileLayer({
  source: new XYZ({
    url: tileUrl(source.id),
    attributions: source.attribution || source.name,
    maxZoom: source.max_zoom,
    minZoom: source.min_zoom,
    tileSize: source.tile_size,
    crossOrigin: "anonymous",
  }),
});

const vectorTile: SourceFactory = (source, settings) => new VectorTileLayer({
  source: new VectorTileSource({ format: new MVT(), url: remoteUrl(source, settings) }),
});

const wfs: SourceFactory = (source, settings) => new VectorLayer({
  source: new VectorSource({
    format: new GeoJSON(),
    url: remoteUrl(source, settings),
  }),
});

const img: SourceFactory = (source, settings) => {
  const params = paramsOf(source);
  const extent = Array.isArray(params.extent) && params.extent.length === 4
    ? params.extent.map(Number) as [number, number, number, number]
    : [-20037508, -20037508, 20037508, 20037508];
  return new ImageLayer({
    source: new ImageStatic({
      url: remoteUrl(source, settings),
      imageExtent: extent,
      projection: source.projection || "EPSG:3857",
    }),
  });
};

const featureFactory = (format: GeoJSON | GPX | KML): SourceFactory => (source, settings) => {
  const url = remoteUrl(source, settings) || source.base_path;
  return new VectorLayer({
    source: new VectorSource({ format, url }),
  });
};

export const sourceFactories: Record<string, SourceFactory> = {
  xyz,
  wmts,
  wms,
  local_tile: localTile,
  vector_tile: vectorTile,
  geojson: featureFactory(new GeoJSON()),
  gpx: featureFactory(new GPX()),
  kml: featureFactory(new KML()),
  wfs,
  img,
  shapefile: featureFactory(new GeoJSON()),
};
