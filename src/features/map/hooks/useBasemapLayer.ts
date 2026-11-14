import { useEffect, useState, type RefObject } from "react";
import type OlMap from "ol/Map";
import TileLayer from "ol/layer/Tile";
import VectorTileLayer from "ol/layer/VectorTile";
import { buildLayer, sourceId } from "../../layers/domain/layerBuilder";
import type { LocalSource } from "../../../infrastructure/tauri";
import { recordDebugEvent, recordTileEvent, recordTileStart } from "../../debug/services/debugMonitor";
import { APP_LAYER_TYPE } from "./layerSyncShared";

export function useBasemapLayer(
  mapRef: RefObject<OlMap | null>,
  basemap: string,
  settings: Record<string, string>,
  layerSettingsKey: string,
  sources: LocalSource[],
) {
  const [baseLayerError, setBaseLayerError] = useState<string | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || sources.length === 0) return;
    setBaseLayerError(null);
    const layer = buildLayer(basemap, settings, sources, false);
    const previousLayers = map.getLayers().getArray().filter(
      (item) => item.get(APP_LAYER_TYPE) === "basemap",
    );
    if (!layer) {
      const numericId = sourceId(basemap);
      const selected = numericId !== null ? sources.find((item) => item.id === numericId) : undefined;
      if (selected && !selected.url.trim() && !selected.base_path.trim()) {
        setBaseLayerError("Karttatasolta puuttuu lähdeosoite. Lisää URL-osoite tason muokkauksesta.");
      } else {
        setBaseLayerError("Karttatason asetukset puuttuvat tai tasoa ei voitu luoda.");
      }
      return;
    }
    layer.set(APP_LAYER_TYPE, "basemap");
    const source = layer instanceof TileLayer || layer instanceof VectorTileLayer ? layer.getSource() : null;
    if (!source) {
      previousLayers.forEach((previous) => map.removeLayer(previous));
      layer.setZIndex(0);
      map.addLayer(layer);
      return () => {
        map.removeLayer(layer);
      };
    }

    let settled = false;
    let loadedTiles = 0;
    let failedTiles = 0;

    const onTileStart = () => {
      recordTileStart();
    };

    const onLoad = () => {
      loadedTiles += 1;
      recordTileEvent(true);
      if (!settled) {
        settled = true;
        window.clearTimeout(timeout);
        previousLayers.forEach((previous) => map.removeLayer(previous));
        layer.setZIndex(0);
      }
    };

    const onError = () => {
      failedTiles += 1;
      recordTileEvent(false);
      recordDebugEvent("tiles", "Tile load failed", "warning");
      if (!settled && failedTiles >= 5 && loadedTiles === 0) {
        settled = true;
        window.clearTimeout(timeout);
        source.un("tileloadstart", onTileStart);
        source.un("tileloadend", onLoad);
        source.un("tileloaderror", onError);
        map.removeLayer(layer);
        setBaseLayerError("Karttatiilien lataus epäonnistui. Tarkista yhteys.");
      }
    };

    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        if (loadedTiles > 0) {
          previousLayers.forEach((previous) => map.removeLayer(previous));
          layer.setZIndex(0);
        } else {
          source.un("tileloadstart", onTileStart);
          source.un("tileloadend", onLoad);
          source.un("tileloaderror", onError);
          map.removeLayer(layer);
          setBaseLayerError("Karttatiilien lataus aikakatkaistiin. Aiempi karttataso säilytettiin.");
        }
      }
    }, 15_000);

    source.on("tileloadstart", onTileStart);
    source.on("tileloadend", onLoad);
    source.on("tileloaderror", onError);
    layer.setZIndex(1);
    map.addLayer(layer);

    return () => {
      window.clearTimeout(timeout);
      source.un("tileloadstart", onTileStart);
      source.un("tileloadend", onLoad);
      source.un("tileloaderror", onError);
      map.removeLayer(layer);
    };
  }, [mapRef, basemap, layerSettingsKey, sources]);

  return { baseLayerError };
}
