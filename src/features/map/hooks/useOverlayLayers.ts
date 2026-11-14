import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type OlMap from "ol/Map";
import type BaseLayer from "ol/layer/Base";
import TileLayer from "ol/layer/Tile";
import VectorTileLayer from "ol/layer/VectorTile";
import { buildLayer, sourceId } from "../../layers/domain/layerBuilder";
import type { LocalSource } from "../../../infrastructure/tauri";
import { recordDebugEvent, recordTileEvent, recordTileStart } from "../../debug/services/debugMonitor";
import { APP_LAYER_ID, APP_LAYER_SIGNATURE, APP_LAYER_TYPE, sourceSignature } from "./layerSyncShared";

interface OverlayTileListeners {
  start: () => void;
  end: () => void;
  error: () => void;
}

export function useOverlayLayers(
  mapRef: RefObject<OlMap | null>,
  overlayRefs: MutableRefObject<BaseLayer[]>,
  overlays: string[],
  overlayOrder: string[],
  settings: Record<string, string>,
  layerSettingsKey: string,
  sources: LocalSource[],
) {
  const overlayListenersRef = useRef<Map<BaseLayer, OverlayTileListeners>>(new Map());

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const cleanupOverlay = (overlayLayer: BaseLayer) => {
      const src = (overlayLayer instanceof TileLayer || overlayLayer instanceof VectorTileLayer)
        ? overlayLayer.getSource()
        : null;
      const listeners = overlayListenersRef.current.get(overlayLayer);
      if (src && listeners) {
        src.un("tileloadstart", listeners.start);
        src.un("tileloadend", listeners.end);
        src.un("tileloaderror", listeners.error);
        overlayListenersRef.current.delete(overlayLayer);
      }
      map.removeLayer(overlayLayer);
    };

    const existingLayers = new Map<string, BaseLayer>();
    map.getLayers().getArray()
      .filter((layer) => layer.get(APP_LAYER_TYPE) === "overlay")
      .forEach((layer) => {
        const id = layer.get(APP_LAYER_ID);
        if (typeof id === "string") existingLayers.set(id, layer);
        else cleanupOverlay(layer);
      });

    const sortedIds = [...overlays].sort((a, b) => {
      const ai = overlayOrder.indexOf(a);
      const bi = overlayOrder.indexOf(b);
      return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
    });

    const activeIds = new Set(sortedIds);
    existingLayers.forEach((layer, id) => {
      if (!activeIds.has(id)) {
        cleanupOverlay(layer);
        existingLayers.delete(id);
      }
    });

    const nextOverlayRefs: BaseLayer[] = [];
    sortedIds.forEach((id, index) => {
      const numericId = sourceId(id);
      const src = numericId !== null ? sources.find((item) => item.id === numericId) : undefined;
      if (src && src.role !== "overlay") return;
      const sig = sourceSignature(src, layerSettingsKey);
      const existing = existingLayers.get(id);
      if (existing && sig && existing.get(APP_LAYER_SIGNATURE) === sig) {
        if (src) existing.setOpacity(src.opacity);
        existing.setZIndex(10 + index);
        nextOverlayRefs.push(existing);
        return;
      }
      if (existing) {
        cleanupOverlay(existing);
      }
      const layer = buildLayer(id, settings, sources, true);
      if (!layer) return;
      layer.set(APP_LAYER_TYPE, "overlay");
      layer.set(APP_LAYER_ID, id);
      layer.set(APP_LAYER_SIGNATURE, sig);
      layer.setZIndex(10 + index);

      const tileSource = (layer instanceof TileLayer || layer instanceof VectorTileLayer) ? layer.getSource() : null;
      if (tileSource) {
        const start = () => recordTileStart();
        const end = () => recordTileEvent(true);
        const error = () => {
          recordTileEvent(false);
          recordDebugEvent("tiles", `Overlay tile failed (${id})`, "warning");
        };
        tileSource.on("tileloadstart", start);
        tileSource.on("tileloadend", end);
        tileSource.on("tileloaderror", error);
        overlayListenersRef.current.set(layer, { start, end, error });
      }

      map.addLayer(layer);
      nextOverlayRefs.push(layer);
    });
    overlayRefs.current = nextOverlayRefs;
  }, [mapRef, overlayRefs, overlays, overlayOrder, layerSettingsKey, sources]);
}
