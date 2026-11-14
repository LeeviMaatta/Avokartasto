import { invokeTauri } from "./runtime";
import type { MapSource } from "../../shared/types/sourceTypes";

export type LocalSource = MapSource;

export const listSources = async (): Promise<LocalSource[]> => {
  const sources = await invokeTauri<LocalSource[]>("list_sources");
  return sources.map((source) => ({
    ...source,
    api_type: source.api_type === ("tile" as never) ? "local_tile" : source.api_type,
    url: source.url,
    kind: source.kind || "raster",
  }));
};

export const deleteSource = (id: number) => invokeTauri<void>("delete_source", { id });

export type SourceInput = Omit<MapSource, "id" | "builtin_key" | "is_default" | "factory_json" | "kind">;

export const addSourceConfig = (source: SourceInput) =>
  invokeTauri<number>("add_source_config", { source });

export const updateSourceConfig = (id: number, source: SourceInput) =>
  invokeTauri<void>("update_source_config", { id, source });

export const resetSourceToDefault = (id: number) =>
  invokeTauri<void>("reset_source_to_default", { id });
