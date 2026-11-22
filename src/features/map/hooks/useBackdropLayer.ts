import { useEffect, useRef, type RefObject } from "react";
import type OlMap from "ol/Map";
import type BaseLayer from "ol/layer/Base";
import TileLayer from "ol/layer/Tile";
import { buildBackdropLayer, sourceId } from "../../layers/domain/layerBuilder";
import { BACKDROP_MAX_ZOOM, preloadBackdropLayer } from "../services/backdropCache";
import { useMapStore } from "../../../store/mapStore";
import type { LocalSource } from "../../../infrastructure/tauri";
import { APP_LAYER_ID, APP_LAYER_SIGNATURE, APP_LAYER_TYPE, sourceSignature } from "./layerSyncShared";

export function useBackdropLayer(
  mapRef: RefObject<OlMap | null>,
  settings: Record<string, string>,
  layerSettingsKey: string,
  sources: LocalSource[],
) {
  const backdropLayerId = settings.backdropLayerId ?? "";
  const backdropLayerRef = useRef<BaseLayer | null>(null);

  useEffect(() => {
    return () => {
      const map = mapRef.current;
      if (map && backdropLayerRef.current) {
        map.removeLayer(backdropLayerRef.current);
        backdropLayerRef.current = null;
      }
    };
  }, [mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || sources.length === 0) return;

    const removeCurrentBackdrop = () => {
      if (backdropLayerRef.current) {
        map.removeLayer(backdropLayerRef.current);
        backdropLayerRef.current = null;
      }
      map.getLayers().getArray()
        .filter((item) => item.get(APP_LAYER_TYPE) === "backdrop")
        .forEach((item) => map.removeLayer(item));
    };

    if (!backdropLayerId) {
      removeCurrentBackdrop();
      return;
    }

    const numericId = sourceId(backdropLayerId);
    const src = numericId !== null ? sources.find((item) => item.id === numericId) : undefined;
    const sig = sourceSignature(src, layerSettingsKey);
    const current = backdropLayerRef.current;
    if (current && sig && current.get(APP_LAYER_SIGNATURE) === sig) {
      current.setZIndex(-1);
      return;
    }

    removeCurrentBackdrop();
    const layer = buildBackdropLayer(backdropLayerId, settings, sources, BACKDROP_MAX_ZOOM);
    if (!layer) return;

    layer.set(APP_LAYER_TYPE, "backdrop");
    layer.set(APP_LAYER_ID, backdropLayerId);
    layer.set(APP_LAYER_SIGNATURE, sig);
    layer.setZIndex(-1);
    map.addLayer(layer);
    backdropLayerRef.current = layer;

    if (src) {
      const tileSource = layer instanceof TileLayer ? layer.getSource() : null;
      void preloadBackdropLayer({
        source: src,
        settings,
        centerCoord: useMapStore.getState().centerCoord,
        tileSource,
      });
    }
  }, [mapRef, backdropLayerId, layerSettingsKey, sources]);
}
