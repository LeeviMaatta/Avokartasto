import type { ApiType, SourceRole } from "../../../shared/types/sourceTypes";

export type NewLayerSource = {
  name: string;
  base_path: string;
  pattern: string;
  url: string;
  role: SourceRole;
  api_type: ApiType;
  opacity: number;
  tile_size: number;
  max_zoom: number;
  layer_name: string;
  style: string;
  attribution: string;
  params: string;
};

export interface LayerTypeOption {
  apiType: ApiType;
  label: string;
}

export const BASEMAP_LAYER_TYPES: LayerTypeOption[] = [
  { apiType: "vector_tile", label: "Vector Tile API" },
  { apiType: "xyz", label: "Tile Map API" },
  { apiType: "wmts", label: "WMTS API" },
  { apiType: "wms", label: "WMS API" },
  { apiType: "local_tile", label: "Local tile" },
];

export const OVERLAY_LAYER_TYPES: LayerTypeOption[] = [
  { apiType: "draw", label: "Piirrä kartalle" },
  { apiType: "img", label: "Kuva (.pdf, .jpg, .png)" },
  { apiType: "geojson", label: "GeoJSON" },
  { apiType: "gpx", label: "GPX" },
  { apiType: "kml", label: "KML" },
  { apiType: "wfs", label: "WFS API" },
  { apiType: "vector_tile", label: "Vector Tile API" },
  { apiType: "xyz", label: "Tile Map API" },
  { apiType: "wmts", label: "WMTS API" },
  { apiType: "wms", label: "WMS API" },
  { apiType: "local_tile", label: "Local tile" },
];

export interface LayerTypeConfig {
  label: string;
  urlLabel: string;
  urlPlaceholder: string;
  showUrl: boolean;
  showLocalPath: boolean;
  showPattern: boolean;
  showFilePicker: boolean;
  fileAccept?: string;
  showLayerName: boolean;
  layerNameRequired?: boolean;
  showStyle: boolean;
  showWmsFormat: boolean;
  showTileSize: boolean;
  showMaxZoom: boolean;
  showAttribution: boolean;
  showImageExtent: boolean;
  showDrawStyle: boolean;
  showZoomViewSettings: boolean;
}

const DEFAULT_CONFIG: LayerTypeConfig = {
  label: "Karttataso",
  urlLabel: "Palvelun URL",
  urlPlaceholder: "https://...",
  showUrl: true,
  showLocalPath: false,
  showPattern: false,
  showFilePicker: false,
  showLayerName: false,
  showStyle: false,
  showWmsFormat: false,
  showTileSize: false,
  showMaxZoom: false,
  showAttribution: true,
  showImageExtent: false,
  showDrawStyle: false,
  showZoomViewSettings: false,
};

const TYPE_CONFIGS: Record<ApiType, LayerTypeConfig> = {
  vector_tile: {
    ...DEFAULT_CONFIG,
    label: "Vector Tile API",
    urlLabel: "Palvelun URL",
    urlPlaceholder: "https://.../{z}/{x}/{y}.pbf",
    showStyle: true,
    showMaxZoom: true,
    showZoomViewSettings: true,
  },
  xyz: {
    ...DEFAULT_CONFIG,
    label: "Tile Map API",
    urlLabel: "Tiilipalvelun URL",
    urlPlaceholder: "https://.../{z}/{x}/{y}.png",
    showTileSize: true,
    showMaxZoom: true,
    showZoomViewSettings: true,
  },
  wmts: {
    ...DEFAULT_CONFIG,
    label: "WMTS API",
    urlLabel: "WMTS-tiili-URL tai endpoint",
    urlPlaceholder: "https://.../{TileMatrix}/{TileRow}/{TileCol}.png",
    showLayerName: true,
    showStyle: true,
    showTileSize: true,
    showMaxZoom: true,
    showZoomViewSettings: true,
  },
  wms: {
    ...DEFAULT_CONFIG,
    label: "WMS API",
    urlLabel: "WMS-palvelun perus-URL",
    urlPlaceholder: "https://.../wms",
    showLayerName: true,
    layerNameRequired: true,
    showStyle: true,
    showWmsFormat: true,
    showTileSize: true,
    showMaxZoom: true,
    showZoomViewSettings: true,
  },
  local_tile: {
    ...DEFAULT_CONFIG,
    label: "Local tile",
    showUrl: false,
    showLocalPath: true,
    showPattern: true,
    showTileSize: true,
    showMaxZoom: true,
    showZoomViewSettings: true,
  },
  geojson: {
    ...DEFAULT_CONFIG,
    label: "GeoJSON",
    urlLabel: "Tai suorana URL-osoitteena (https://...)",
    urlPlaceholder: "https://.../aineisto.geojson",
    showFilePicker: true,
    fileAccept: ".geojson,.json",
    showDrawStyle: true,
  },
  gpx: {
    ...DEFAULT_CONFIG,
    label: "GPX",
    urlLabel: "Tai suorana URL-osoitteena (https://...)",
    urlPlaceholder: "https://.../reitti.gpx",
    showFilePicker: true,
    fileAccept: ".gpx",
    showDrawStyle: true,
  },
  kml: {
    ...DEFAULT_CONFIG,
    label: "KML",
    urlLabel: "Tai suorana URL-osoitteena (https://...)",
    urlPlaceholder: "https://.../kohteet.kml",
    showFilePicker: true,
    fileAccept: ".kml",
    showDrawStyle: true,
  },
  wfs: {
    ...DEFAULT_CONFIG,
    label: "WFS API",
    urlLabel: "WFS-rajapinnan URL (GeoJSON / GetFeature)",
    urlPlaceholder: "https://.../wfs?service=WFS&request=GetFeature&outputFormat=application/json",
    showLayerName: true,
  },
  img: {
    ...DEFAULT_CONFIG,
    label: "Kuva (.pdf, .jpg, .png)",
    urlLabel: "Tai suorana URL-osoitteena (https://...)",
    urlPlaceholder: "https://.../kuva.png",
    showFilePicker: true,
    fileAccept: ".pdf,.jpg,.jpeg,.png",
    showImageExtent: true,
  },
  draw: {
    ...DEFAULT_CONFIG,
    label: "Piirrä kartalle",
    showUrl: false,
    showAttribution: false,
    showDrawStyle: true,
  },
  shapefile: {
    ...DEFAULT_CONFIG,
    label: "Shapefile",
  },
};

export function getLayerTypeConfig(apiType: ApiType, _role: SourceRole): LayerTypeConfig {
  return TYPE_CONFIGS[apiType] ?? DEFAULT_CONFIG;
}

export function parseLayerParams(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function createDefaultNewLayerSource(role: SourceRole, apiType: ApiType): NewLayerSource {
  const defaultParams =
    apiType === "draw"
      ? JSON.stringify({ strokeColor: "#2563eb", strokeWidth: 3, featuresGeoJson: "" })
      : apiType === "wms"
        ? JSON.stringify({ format: "image/png" })
        : "{}";

  return {
    name: apiType === "draw" ? "Oma piirros" : "",
    base_path: "",
    pattern: "{z}/{x}/{y}.png",
    url: "",
    role,
    api_type: apiType,
    opacity: 1,
    tile_size: 256,
    max_zoom: apiType === "vector_tile" ? 15 : 19,
    layer_name: "",
    style: apiType === "wmts" ? "default" : "",
    attribution: "",
    params: defaultParams,
  };
}

export function isNewLayerValid(source: Pick<NewLayerSource, "name" | "base_path" | "url" | "api_type" | "layer_name" | "params">): boolean {
  const urlOrPath = source.url.trim() || source.base_path.trim();
  const params = parseLayerParams(source.params);
  switch (source.api_type) {
    case "draw":
      return source.name.trim().length > 0;
    case "local_tile":
      return source.base_path.trim().length > 0;
    case "wms":
      return urlOrPath.length > 0 && source.layer_name.trim().length > 0;
    case "img": {
      const hasData = typeof params.dataUrl === "string" && params.dataUrl.length > 0;
      const hasExtent = Array.isArray(params.extent) && params.extent.length === 4;
      return (urlOrPath.length > 0 || hasData) && (hasExtent || urlOrPath.length > 0);
    }
    case "geojson":
    case "gpx":
    case "kml": {
      const hasInline = typeof params.inlineData === "string" && params.inlineData.trim().length > 0;
      return urlOrPath.length > 0 || hasInline;
    }
    default:
      return urlOrPath.length > 0;
  }
}
