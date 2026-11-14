export type ApiType =
  | "xyz"
  | "wmts"
  | "wms"
  | "local_tile"
  | "vector_tile"
  | "wfs"
  | "geojson"
  | "gpx"
  | "kml"
  | "shapefile"
  | "img";

export type SourceRole = "basemap" | "overlay";
export type SourceKind = "raster" | "vector" | "features";

export interface MapSource {
  id: number;
  name: string;
  builtin_key: string | null;
  is_default: boolean;
  factory_json: string | null;
  base_path: string;
  pattern: string;
  url: string;
  projection: string;
  role: SourceRole;
  kind: SourceKind;
  opacity: number;
  min_zoom: number;
  max_zoom: number;
  attribution: string;
  api_type: ApiType;
  tile_size: number;
  layer_name: string;
  style: string;
  params: string;
  auth: string;
  note: string;
  view_zoom_offset: number;
  view_magnification: number;
}

export const SOURCE_KINDS: Record<ApiType, SourceKind> = {
  xyz: "raster",
  wmts: "raster",
  wms: "raster",
  local_tile: "raster",
  vector_tile: "vector",
  wfs: "features",
  geojson: "features",
  gpx: "features",
  kml: "features",
  shapefile: "features",
  img: "raster",
};
