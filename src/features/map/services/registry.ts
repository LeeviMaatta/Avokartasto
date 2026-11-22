import type BaseLayer from "ol/layer/Base";
import type { MapSource, SourceLayerOptions } from "../model/sourceTypes";
import { sourceFactories } from "./factories";

const hasInlineParams = (paramsRaw: string | undefined): boolean => {
  if (!paramsRaw) return false;
  try {
    const parsed = JSON.parse(paramsRaw) as Record<string, unknown>;
    return Boolean(
      parsed &&
        ((typeof parsed.dataUrl === "string" && parsed.dataUrl.length > 0) ||
          (typeof parsed.inlineData === "string" && parsed.inlineData.length > 0)),
    );
  } catch {
    return false;
  }
};

export function buildSourceLayer(
  source: MapSource,
  settings: Record<string, string>,
  options?: SourceLayerOptions,
): BaseLayer | null {
  const allowsEmptyUrl = source.api_type === "draw" || hasInlineParams(source.params);
  if (!allowsEmptyUrl && !source.url.trim() && !source.base_path.trim()) return null;
  const factory = sourceFactories[source.api_type];
  if (!factory) return null;
  const layer = factory(source, settings, options);
  if (!layer) return null;
  layer.setOpacity(source.opacity);
  layer.set("sourceId", source.id);
  layer.set("sourceKind", source.kind);
  return layer;
}
