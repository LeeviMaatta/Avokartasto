import { invokeTauri } from "./runtime";

export interface LocalSource {
  id: number;
  name: string;
  base_path: string;
  pattern: string;
  projection: string;
  role: "basemap" | "overlay";
  opacity: number;
  max_zoom: number;
  attribution: string;
  api_type: "tile" | "wms";
  tile_size: number;
  layer_name: string;
  style: string;
}

export const listSources = async (): Promise<LocalSource[]> => invokeTauri("list_sources");

export const addSource = (
  name: string,
  basePath: string,
  pattern: string,
  role: LocalSource["role"] = "basemap",
  opacity = 1,
  maxZoom = 19,
  attribution = "",
  apiType: LocalSource["api_type"] = "tile",
  tileSize = 256,
  layerName = "",
  style = "",
) => invokeTauri<number>("add_source", { name, basePath, pattern, role, opacity, maxZoom, attribution, apiType, tileSize, layerName, style });

export const updateSource = (
  id: number,
  name: string,
  basePath: string,
  pattern: string,
  role: LocalSource["role"],
  opacity: number,
  maxZoom: number,
  attribution: string,
  apiType: LocalSource["api_type"],
  tileSize: number,
  layerName: string,
  style: string,
) => invokeTauri<void>("update_source", { id, name, basePath, pattern, role, opacity, maxZoom, attribution, apiType, tileSize, layerName, style });

export const deleteSource = (id: number) => invokeTauri<void>("delete_source", { id });
