import type { LocalSource } from "../../../infrastructure/tauri";

export const APP_LAYER_TYPE = "avokartasto-layer-type";
export const APP_LAYER_ID = "avokartasto-layer-id";
export const APP_LAYER_SIGNATURE = "avokartasto-layer-signature";

export function buildLayerSettingsKey(settings: Record<string, string>): string {
  return JSON.stringify([
    settings.mmlKey ?? "",
    settings.lantmaterietUsername ?? "",
    settings.lantmaterietPassword ?? "",
    settings.owmKey ?? "",
    settings.copernicusInstanceId ?? "",
    settings.tileCache ?? "1",
    settings.layerViewSettings ?? "{}",
  ]);
}

export function sourceSignature(source: LocalSource | undefined, layerSettingsKey: string): string {
  if (!source) return "";
  return JSON.stringify([
    source.id,
    source.api_type,
    source.url,
    source.base_path,
    source.pattern,
    source.projection,
    source.min_zoom,
    source.max_zoom,
    source.tile_size,
    source.layer_name,
    source.style,
    source.attribution,
    source.params,
    source.auth,
    source.view_zoom_offset,
    source.view_magnification,
    layerSettingsKey,
  ]);
}
