import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import OlMap from "ol/Map";
import BaseLayer from "ol/layer/Base";
import TileLayer from "ol/layer/Tile";
import VectorTileLayer from "ol/layer/VectorTile";
import TileWMS from "ol/source/TileWMS";
import { buildBackdropLayer, buildLayer, sourceId } from "../layers";
import { BACKDROP_MAX_ZOOM, preloadBackdropLayer } from "../sources/backdropCache";
import { buildCopernicusWmsParams } from "../sources/copernicusParams";
import { useMapStore } from "../../../store/mapStore";
import type { LocalSource } from "../../../infrastructure/tauriBridge";
import { recordDebugEvent, recordTileEvent, recordTileStart } from "../../debug/debugMonitor";

const APP_LAYER_TYPE = "avokartasto-layer-type";
const APP_LAYER_ID = "avokartasto-layer-id";
const APP_LAYER_SIGNATURE = "avokartasto-layer-signature";

interface MapLayersOptions {
  mapRef: RefObject<OlMap | null>;
  overlayRefs: MutableRefObject<BaseLayer[]>;
  basemap: string;
  overlays: string[];
  overlayOrder: string[];
  settings: Record<string, string>;
  sources: LocalSource[];
}

const sourceSignature = (source: LocalSource | undefined, layerSettingsKey: string) =>
  source
    ? JSON.stringify([
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
      ])
    : "";

export function useMapLayers({ mapRef, overlayRefs, basemap, overlays, overlayOrder, settings, sources }: MapLayersOptions) {
  const [baseLayerError, setBaseLayerError] = useState<string | null>(null);
  const overlayListenersRef = useRef<Map<BaseLayer, { start: () => void; end: () => void; error: () => void }>>(new Map());

  const layerSettingsKey = JSON.stringify([
    settings.mmlKey ?? "",
    settings.lantmaterietUsername ?? "",
    settings.lantmaterietPassword ?? "",
    settings.owmKey ?? "",
    settings.copernicusInstanceId ?? "",
    settings.tileCache ?? "1",
    settings.layerViewSettings ?? "{}",
  ]);
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextParams = buildCopernicusWmsParams(settings);
    map.getLayers().getArray().forEach((item) => {
      if (!item.get("isCopernicus") || !(item instanceof TileLayer)) return;
      const src = item.getSource();
      if (src instanceof TileWMS) {
        src.updateParams(nextParams);
      }
    });
  }, [
    mapRef,
    basemap,
    overlays,
    settings.copernicusLayerName,
    settings.copernicusMaxCloud,
    settings.copernicusDateMode,
    settings.copernicusSingleDate,
    settings.copernicusRangeStart,
    settings.copernicusRangeEnd,
    settings.copernicusRangeYear,
    settings.copernicusRangeSelectedDate,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (sources.length === 0) return;
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

  return { baseLayerError };
}
