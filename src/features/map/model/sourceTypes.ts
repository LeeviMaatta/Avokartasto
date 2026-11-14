import type BaseLayer from "ol/layer/Base";
import type { MapSource } from "../../../shared/types/sourceTypes";

export { SOURCE_KINDS } from "../../../shared/types/sourceTypes";
export type { ApiType, MapSource, SourceKind, SourceRole } from "../../../shared/types/sourceTypes";

export interface SourceLayerOptions {
  /** Cap the maximum tile zoom generated for this layer (used for background fallback layers). */
  maxZoomCap?: number;
  /** Override the OpenLayers TileSource LRU cache size for this layer. */
  cacheSize?: number;
}

export type SourceFactory = (
  source: MapSource,
  settings: Record<string, string>,
  options?: SourceLayerOptions,
) => BaseLayer | null;
