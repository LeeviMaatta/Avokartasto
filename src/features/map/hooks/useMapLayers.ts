import type { MutableRefObject, RefObject } from "react";
import type OlMap from "ol/Map";
import type BaseLayer from "ol/layer/Base";
import type { LocalSource } from "../../../infrastructure/tauri";
import { buildLayerSettingsKey } from "./layerSyncShared";
import { useBackdropLayer } from "./useBackdropLayer";
import { useBasemapLayer } from "./useBasemapLayer";
import { useCopernicusSync } from "./useCopernicusSync";
import { useOverlayLayers } from "./useOverlayLayers";

interface MapLayersOptions {
  mapRef: RefObject<OlMap | null>;
  overlayRefs: MutableRefObject<BaseLayer[]>;
  basemap: string;
  overlays: string[];
  overlayOrder: string[];
  settings: Record<string, string>;
  sources: LocalSource[];
}

export function useMapLayers({ mapRef, overlayRefs, basemap, overlays, overlayOrder, settings, sources }: MapLayersOptions) {
  const layerSettingsKey = buildLayerSettingsKey(settings);

  useBackdropLayer(mapRef, settings, layerSettingsKey, sources);
  useCopernicusSync(mapRef, basemap, overlays, settings);
  const { baseLayerError } = useBasemapLayer(mapRef, basemap, settings, layerSettingsKey, sources);
  useOverlayLayers(mapRef, overlayRefs, overlays, overlayOrder, settings, layerSettingsKey, sources);

  return { baseLayerError };
}
