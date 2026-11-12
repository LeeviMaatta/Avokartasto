import { invokeTauri } from "./runtime";
import type { MapSource } from "../../features/map/sources/model/sourceTypes";

export type LocalSource = MapSource;

export const listSources = async (): Promise<LocalSource[]> => {
  const sources = await invokeTauri<LocalSource[]>("list_sources");
  return sources.map((source) => ({
    ...source,
    api_type: source.api_type === ("tile" as never) ? "local_tile" : source.api_type,
    url: source.url || source.base_path,
    kind: source.kind || "raster",
  }));
};

export const addSource = (
  name: string,
  basePath: string,
  pattern: string,
  role: LocalSource["role"] = "basemap",
  opacity = 1,
  maxZoom = 19,
  attribution = "",
  apiType: LocalSource["api_type"] = "local_tile",
  tileSize = 256,
  layerName = "",
  style = "",
) => invokeTauri<number>("add_source", { name, basePath, pattern, role, opacity, maxZoom, attribution, apiType: apiType === "local_tile" ? "tile" : apiType, tileSize, layerName, style });

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

export type SourceInput = Omit<MapSource, "id" | "builtin_key" | "is_default" | "factory_json" | "kind">;

export const addSourceConfig = (source: SourceInput) =>
  invokeTauri<number>("add_source_config", { source });

export const updateSourceConfig = (id: number, source: SourceInput) =>
  invokeTauri<void>("update_source_config", { id, source });

export const resetSourceToDefault = (id: number) =>
  invokeTauri<void>("reset_source_to_default", { id });
