import type BaseLayer from "ol/layer/Base";
import type { MapSource } from "./model/sourceTypes";
import { sourceFactories } from "./factories";

export function buildSourceLayer(source: MapSource, settings: Record<string, string>): BaseLayer | null {
  const factory = sourceFactories[source.api_type];
  if (!factory) return null;
  const layer = factory(source, settings);
  if (!layer) return null;
  layer.setOpacity(source.opacity);
  layer.set("sourceId", source.id);
  layer.set("sourceKind", source.kind);
  return layer;
}
