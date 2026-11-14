import type { LocalSource } from "../../../infrastructure/tauri";
import type { UiStyle } from "../../settings/model/settingTypes";
import type { SelectedMeasurementItem } from "../../measurements/domain/measurementSelection";
import { isSelectedMeasurementFeature, measurementStyle } from "../styles/featureStyles";

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

/** Builds the OpenLayers style function for the measurement vector layer, showing segment or total labels for active measurements. */
export function buildMeasurementLayerStyle(
  settings: Record<string, string>,
  editingFeatureId: number | null,
  activeUnsavedMeasurementId: string | null,
  selectedMeasurements: SelectedMeasurementItem[] = [],
) {
  const parsedMinSegDist = Number(settings.segmentLengthMinDistance ?? "500");
  const parsedMinZoom = Number(settings.segmentLengthsMinZoom ?? "13");
  const uiStyle: UiStyle =
    settings.uiStyle === "classic" || settings.uiStyle === "retro" ? settings.uiStyle : "modern";
  return measurementStyle(
    {
      saved: settings.savedMeasurementColor || "#16a34a",
      unsaved: settings.unsavedMeasurementColor || "#2563eb",
    },
    settings.showSegmentLengths !== "0",
    settings.measurementUnits ?? "metric",
    {
      minSegmentDistanceM: Number.isFinite(parsedMinSegDist) ? parsedMinSegDist : 500,
      hideByZoom: settings.hideSegmentLengthsByZoom !== "0",
      minZoomForSegments: Number.isFinite(parsedMinZoom) ? parsedMinZoom : 13,
      showTotalOnly: selectedMeasurements.length > 1,
      theme: settings.theme === "dark" ? "dark" : "light",
      uiStyle,
      isSelectedFeature: (feature) =>
        isSelectedMeasurementFeature(
          feature,
          editingFeatureId,
          activeUnsavedMeasurementId,
          selectedMeasurements,
        ),
    },
  );
}
