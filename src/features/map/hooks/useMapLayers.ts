import { useEffect, useState, type MutableRefObject, type RefObject } from "react";
import OlMap from "ol/Map";
import TileLayer from "ol/layer/Tile";
import { buildLayer } from "../layers";
import type { LocalSource } from "../../../infrastructure/tauriBridge";

const APP_LAYER_TYPE = "karttasovellus-layer-type";

interface MapLayersOptions {
  mapRef: RefObject<OlMap | null>;
  overlayRefs: MutableRefObject<TileLayer<any>[]>;
  basemap: string;
  overlays: string[];
  overlayOrder: string[];
  settings: Record<string, string>;
  sources: LocalSource[];
}

export function useMapLayers({ mapRef, overlayRefs, basemap, overlays, overlayOrder, settings, sources }: MapLayersOptions) {
  const [baseLayerError, setBaseLayerError] = useState<string | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setBaseLayerError(null);
    const layer = buildLayer(basemap, settings, sources, false);
    const previousLayers = map.getLayers().getArray().filter(
      (item) => item instanceof TileLayer && item.get(APP_LAYER_TYPE) === "basemap",
    ) as TileLayer<any>[];
    if (!layer) {
      setBaseLayerError("Karttatason asetukset puuttuvat tai tasoa ei voitu luoda.");
      return;
    }
    layer.set(APP_LAYER_TYPE, "basemap");
    const source = layer.getSource();
    if (!source) return;
    let settled = false;
    let loadedTiles = 0;
    let failedTiles = 0;
    const finish = (success: boolean, message?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      source.un("tileloadend", onLoad);
      source.un("tileloaderror", onError);
      if (success) {
        previousLayers.forEach((previous) => map.removeLayer(previous));
        layer.setZIndex(0);
      } else {
        map.removeLayer(layer);
        setBaseLayerError(message ?? "Karttatiilien lataus epäonnistui.");
      }
    };
    const onLoad = () => {
      loadedTiles += 1;
      finish(true);
    };
    const onError = () => {
      failedTiles += 1;
      if (failedTiles >= 5 && loadedTiles === 0) finish(false, "Karttatiilien lataus epäonnistui. Tarkista tunnukset.");
    };
    const timeout = window.setTimeout(() => finish(
      loadedTiles > 0,
      loadedTiles > 0 ? undefined : "Karttatiilien lataus aikakatkaistiin. Aiempi karttataso säilytettiin.",
    ), 15_000);
    source.on("tileloadend", onLoad);
    source.on("tileloaderror", onError);
    layer.setZIndex(1);
    map.addLayer(layer);
    return () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      source.un("tileloadend", onLoad);
      source.un("tileloaderror", onError);
      map.removeLayer(layer);
    };
  }, [mapRef, basemap, settings.mmlKey, settings.lantmaterietUsername, settings.lantmaterietPassword, settings.layerCopies, settings.layerViewSettings, sources]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getLayers().getArray()
      .filter((layer) => layer instanceof TileLayer && layer.get(APP_LAYER_TYPE) === "overlay")
      .forEach((layer) => map.removeLayer(layer));
    overlayRefs.current = [];
    [...overlays].sort((a, b) => {
      const ai = overlayOrder.indexOf(a);
      const bi = overlayOrder.indexOf(b);
      return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
    }).forEach((id, index) => {
      const layer = buildLayer(id, settings, sources, true);
      if (!layer) return;
      layer.set(APP_LAYER_TYPE, "overlay");
      layer.setZIndex(10 + index);
      map.addLayer(layer);
      overlayRefs.current.push(layer);
    });
  }, [mapRef, overlayRefs, overlays, overlayOrder, settings.mmlKey, settings.owmKey, settings.layerCopies, settings.layerViewSettings, sources]);

  return { baseLayerError };
}
