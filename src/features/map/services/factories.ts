import TileLayer from "ol/layer/Tile";
import { createXYZ } from "ol/tilegrid";
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
import Style from "ol/style/Style";
import Stroke from "ol/style/Stroke";
import Fill from "ol/style/Fill";
import CircleStyle from "ol/style/Circle";
import { tileUrl, remoteTileUrl } from "../../../infrastructure/tauri";
import type { MapSource, SourceFactory, SourceLayerOptions } from "../model/sourceTypes";
import { resolveSourceUrl } from "./resolveUrl";
import { buildCopernicusWmsParams, isCopernicusSource } from "./copernicusParams";
import { createWmtsLayer } from "./wmtsSource";
import { computeRotatedExtent, createRotatedImageDataUrl } from "./imageTransform";
import { createDynamicPdfSource } from "./pdfDynamicSource";

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

const cacheSizeOf = (settings: Record<string, string>, options?: SourceLayerOptions) =>
  settings.tileCache === "0" ? 0 : options?.cacheSize;

const effectiveMaxZoomOf = (source: MapSource, options?: SourceLayerOptions, limit?: number) => {
  const base = options?.maxZoomCap !== undefined ? Math.min(source.max_zoom, options.maxZoomCap) : source.max_zoom;
  return limit !== undefined ? Math.min(base, limit) : base;
};

const xyz: SourceFactory = (source, settings, options) => {
  const isOwm = Boolean(
    (source.builtin_key && source.builtin_key.startsWith("owm-")) ||
    (source.url && source.url.includes("openweathermap.org"))
  );
  return new TileLayer({
    preload: isOwm ? 0 : 1,
    useInterimTilesOnError: true,
    source: new XYZ({
      url: rasterUrl(source, settings),
      attributions: source.attribution || source.name,
      maxZoom: effectiveMaxZoomOf(source, options, isOwm ? 11 : undefined),
      minZoom: source.min_zoom,
      tileSize: source.tile_size,
      cacheSize: cacheSizeOf(settings, options),
      transition: 0,
      crossOrigin: "anonymous",
    }),
  });
};

const wms: SourceFactory = (source, settings, options) => {
  const params = paramsOf(source);
  const copernicus = isCopernicusSource(source);
  const copernicusParams = copernicus ? buildCopernicusWmsParams(settings) : {};
  const maxZoom = effectiveMaxZoomOf(source, options);
  const layer = new TileLayer({
    preload: copernicus ? 0 : 1,
    useInterimTilesOnError: true,
    source: new TileWMS({
      url: remoteUrl(source, settings),
      params: {
        LAYERS: params.layers || source.layer_name,
        STYLES: params.styles || source.style,
        FORMAT: params.format || "image/png",
        VERSION: params.version || "1.3.0",
        TILED: params.tiled ?? true,
        TRANSPARENT: params.transparent ?? true,
        ...copernicusParams,
      },
      ...(copernicus || options?.maxZoomCap !== undefined
        ? { tileGrid: createXYZ({ tileSize: copernicus ? 512 : source.tile_size || 256, maxZoom }) }
        : {}),
      attributions: source.attribution || source.name,
      cacheSize: cacheSizeOf(settings, options),
      transition: 0,
      crossOrigin: "anonymous",
    }),
  });
  if (copernicus) layer.set("isCopernicus", true);
  return layer;
};

const wmts: SourceFactory = (source, settings, options) =>
  createWmtsLayer(source, rasterUrl(source, settings), cacheSizeOf(settings, options), options);

const localTile: SourceFactory = (source, settings, options) => new TileLayer({
  preload: 1,
  useInterimTilesOnError: true,
  source: new XYZ({
    url: tileUrl(source.id),
    attributions: source.attribution || source.name,
    maxZoom: effectiveMaxZoomOf(source, options),
    minZoom: source.min_zoom,
    tileSize: source.tile_size,
    cacheSize: cacheSizeOf(settings, options),
    transition: 0,
    crossOrigin: "anonymous",
  }),
});

const vectorTile: SourceFactory = (source, settings, options) => new VectorTileLayer({
  updateWhileAnimating: false,
  updateWhileInteracting: false,
  source: new VectorTileSource({
    format: new MVT(),
    url: remoteUrl(source, settings),
    maxZoom: effectiveMaxZoomOf(source, options),
    cacheSize: cacheSizeOf(settings, options),
  }),
});

const wfs: SourceFactory = (source, settings) => new VectorLayer({
  updateWhileAnimating: false,
  updateWhileInteracting: false,
  source: new VectorSource({
    format: new GeoJSON(),
    url: remoteUrl(source, settings),
  }),
});

const img: SourceFactory = (source, settings) => {
  const params = paramsOf(source);
  const rawExtent = Array.isArray(params.extent) && params.extent.length === 4
    ? params.extent.map(Number) as [number, number, number, number]
    : [-20037508, -20037508, 20037508, 20037508] as [number, number, number, number];
  const rotation = typeof params.rotation === "number" ? params.rotation : 0;
  const extent = computeRotatedExtent(rawExtent, rotation);
  const remote = remoteUrl(source, settings);
  const dataUrl = typeof params.dataUrl === "string" && params.dataUrl ? params.dataUrl : "";
  const isRemotePdf = Boolean(
    remote && (remote.toLowerCase().split("?")[0].endsWith(".pdf") || typeof params.pdfPage === "number")
  );
  if (isRemotePdf) {
    const pageNumber = typeof params.pdfPage === "number"
      ? params.pdfPage
      : typeof params.pageNumber === "number"
        ? params.pageNumber
        : 1;
    return new ImageLayer({
      source: createDynamicPdfSource(remote, pageNumber, rawExtent, rotation, dataUrl || undefined),
    });
  }
  const imgUrl = dataUrl || remote;
  return new ImageLayer({
    source: new ImageStatic({
      url: imgUrl,
      imageExtent: extent,
      projection: source.projection || "EPSG:3857",
      crossOrigin: "anonymous",
      ...(rotation !== 0
        ? {
            imageLoadFunction: (imageWrapper, src) => {
              const htmlImg = imageWrapper.getImage() as HTMLImageElement;
              void createRotatedImageDataUrl(src, rotation)
                .then((rotatedUrl) => {
                  htmlImg.src = rotatedUrl;
                })
                .catch(() => {
                  htmlImg.src = src;
                });
            },
          }
        : {}),
    }),
  });
};

const vectorStyleFor = (defaultColor: string, defaultWidth: number) => (feature: { get: (k: string) => unknown }) => {
  const color = typeof feature.get("color") === "string" ? String(feature.get("color")) : defaultColor;
  const width = typeof feature.get("width") === "number" ? Number(feature.get("width")) : defaultWidth;
  return new Style({
    stroke: new Stroke({ color, width }),
    fill: new Fill({ color: `${color}33` }),
    image: new CircleStyle({
      radius: Math.max(4, width + 2),
      fill: new Fill({ color }),
      stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
    }),
  });
};

const featureFactory = (format: GeoJSON | GPX | KML): SourceFactory => (source, settings) => {
  const params = paramsOf(source);
  const inlineData = typeof params.inlineData === "string" ? params.inlineData : "";
  const url = remoteUrl(source, settings) || source.base_path;
  const vectorSource = inlineData
    ? new VectorSource({
        features: format.readFeatures(inlineData, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        }),
      })
    : new VectorSource({ format, url });
  const color = typeof params.strokeColor === "string" ? params.strokeColor : "#2563eb";
  const width = typeof params.strokeWidth === "number" ? params.strokeWidth : 2.5;
  return new VectorLayer({
    source: vectorSource,
    style: vectorStyleFor(color, width),
  });
};

const draw: SourceFactory = (source) => {
  const params = paramsOf(source);
  const rawGeoJson = typeof params.featuresGeoJson === "string" ? params.featuresGeoJson : "";
  const features = rawGeoJson
    ? new GeoJSON().readFeatures(rawGeoJson, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
      })
    : [];
  const defaultColor = typeof params.strokeColor === "string" ? params.strokeColor : "#2563eb";
  const defaultWidth = typeof params.strokeWidth === "number" ? params.strokeWidth : 3;
  const layer = new VectorLayer({
    source: new VectorSource({ features }),
    style: vectorStyleFor(defaultColor, defaultWidth),
  });
  layer.set("drawSourceId", source.id);
  return layer;
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
  draw,
  shapefile: featureFactory(new GeoJSON()),
};
