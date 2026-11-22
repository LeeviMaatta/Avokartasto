import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import WMTS, { optionsFromCapabilities } from "ol/source/WMTS";
import WMTSCapabilities from "ol/format/WMTSCapabilities";
import { fetchRemoteAssetBytes } from "../../../infrastructure/tauri/layerSourceBridge";
import type { MapSource, SourceLayerOptions } from "../model/sourceTypes";

function buildCapabilitiesUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  const sep = trimmed.includes("?") ? "&" : "?";
  if (/request=getcapabilities/i.test(trimmed)) return trimmed;
  return `${trimmed}${sep}SERVICE=WMTS&REQUEST=GetCapabilities`;
}

function findMercatorMatrixSet(caps: Record<string, unknown>, layerId: string): string | undefined {
  const contents = caps.Contents as {
    Layer?: Array<{ Identifier?: string; TileMatrixSetLink?: Array<{ TileMatrixSet?: string }> }>;
    TileMatrixSet?: Array<{ Identifier?: string; SupportedCRS?: string }>;
  } | undefined;
  if (!contents) return undefined;

  const targetLayer = contents.Layer?.find((l) => l.Identifier === layerId);
  const linkedSets = new Set(
    targetLayer?.TileMatrixSetLink?.map((link) => link.TileMatrixSet).filter(Boolean) ?? [],
  );

  const matrixSets = contents.TileMatrixSet ?? [];
  const candidates = linkedSets.size > 0
    ? matrixSets.filter((ms) => ms.Identifier && linkedSets.has(ms.Identifier))
    : matrixSets;

  const mercator = candidates.find((ms) => {
    const crs = (ms.SupportedCRS || "").toUpperCase();
    return crs.includes("3857") || crs.includes("900913");
  });
  return mercator?.Identifier ?? candidates[0]?.Identifier;
}

export function createWmtsLayer(
  source: MapSource,
  resolvedUrl: string,
  cacheSize: number | undefined,
  options?: SourceLayerOptions,
): TileLayer<XYZ | WMTS> {
  const hasTemplate = /\{(z|x|y|TileMatrix|TileRow|TileCol)\}/i.test(resolvedUrl);
  if (hasTemplate) {
    const templateUrl = resolvedUrl
      .replace(/\{TileMatrix\}/gi, "{z}")
      .replace(/\{TileRow\}/gi, "{y}")
      .replace(/\{TileCol\}/gi, "{x}")
      .replace(/\{layer\}/gi, encodeURIComponent(source.layer_name || ""))
      .replace(/\{style\}/gi, encodeURIComponent(source.style || "default"));

    const maxZoom = options?.maxZoomCap !== undefined
      ? Math.min(source.max_zoom, options.maxZoomCap)
      : source.max_zoom;

    return new TileLayer({
      preload: 1,
      useInterimTilesOnError: true,
      source: new XYZ({
        url: templateUrl,
        attributions: source.attribution || source.name,
        maxZoom,
        minZoom: source.min_zoom,
        tileSize: source.tile_size,
        cacheSize,
        transition: 0,
        crossOrigin: "anonymous",
      }),
    });
  }

  const layer = new TileLayer<WMTS>({
    preload: 1,
    useInterimTilesOnError: true,
  });

  const capsUrl = buildCapabilitiesUrl(resolvedUrl);
  void fetchRemoteAssetBytes(capsUrl)
    .then((bytes) => {
      const xmlText = new TextDecoder("utf-8").decode(bytes);
      const parser = new WMTSCapabilities();
      const caps = parser.read(xmlText) as Record<string, unknown>;
      const contents = caps.Contents as { Layer?: Array<{ Identifier?: string }> } | undefined;
      const layerId = source.layer_name.trim() || contents?.Layer?.[0]?.Identifier || "";
      if (!layerId) return;

      const matrixSet = findMercatorMatrixSet(caps, layerId);
      const wmtsOptions = optionsFromCapabilities(caps, {
        layer: layerId,
        ...(matrixSet ? { matrixSet } : {}),
        ...(source.style.trim() ? { style: source.style.trim() } : {}),
      });
      if (!wmtsOptions) return;

      layer.setSource(
        new WMTS({
          ...wmtsOptions,
          attributions: source.attribution || source.name,
          cacheSize,
          transition: 0,
          crossOrigin: "anonymous",
        }),
      );
    })
    .catch((err) => {
      console.warn("WMTS GetCapabilities epäonnistui:", err);
    });

  return layer;
}
