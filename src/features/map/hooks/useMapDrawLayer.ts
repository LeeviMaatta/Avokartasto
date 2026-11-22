import { useEffect, useRef, type RefObject } from "react";
import type OlMap from "ol/Map";
import type VectorLayer from "ol/layer/Vector";
import OlVectorSource from "ol/source/Vector";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import GeoJSON from "ol/format/GeoJSON";
import Feature from "ol/Feature";
import { updateSourceConfig, type LocalSource } from "../../../infrastructure/tauri";
import { useMapStore } from "../../../store/mapStore";
import { useDrawLayerStore } from "../../layers/model/drawLayerStore";
import { parseLayerParams } from "../../layers/model/layerTypeConfig";
import type { Extent3857 } from "../../layers/services/imageLayerLoader";
import { useImageAdjustInteraction } from "./useImageAdjustInteraction";

async function saveDrawLayerFeatures(source: LocalSource, vectorSource: OlVectorSource, color: string, width: number) {
  const params = parseLayerParams(source.params);
  const featuresGeoJson = new GeoJSON().writeFeatures(vectorSource.getFeatures(), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });
  await updateSourceConfig(source.id, {
    ...source,
    params: JSON.stringify({ ...params, featuresGeoJson, strokeColor: color, strokeWidth: width }),
  });
  await useMapStore.getState().reloadSources();
}

export function useMapDrawLayer(mapRef: RefObject<OlMap | null>, sources: LocalSource[]) {
  const activeDrawSourceId = useDrawLayerStore((s) => s.activeDrawSourceId);
  const drawTool = useDrawLayerStore((s) => s.drawTool);
  const strokeColor = useDrawLayerStore((s) => s.strokeColor);
  const strokeWidth = useDrawLayerStore((s) => s.strokeWidth);
  const undoNonce = useDrawLayerStore((s) => s.undoNonce);
  const adjustingImageSourceId = useDrawLayerStore((s) => s.adjustingImageSourceId);
  const overlays = useMapStore((s) => s.overlays);
  const tool = useMapStore((s) => s.tool);
  const hasActiveDrawSource =
    activeDrawSourceId !== null && sources.some((s) => s.id === activeDrawSourceId);

  const activeVectorSourceRef = useRef<OlVectorSource | null>(null);
  const lastUndoNonceRef = useRef(undoNonce);
  const prevToolRef = useRef(tool);
  const strokeColorRef = useRef(strokeColor);
  strokeColorRef.current = strokeColor;
  const strokeWidthRef = useRef(strokeWidth);
  strokeWidthRef.current = strokeWidth;
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;

  useEffect(() => {
    if (activeDrawSourceId === null && adjustingImageSourceId === null) return;
    useMapStore.setState({
      tool: "none",
      routePickTarget: null,
      selectedFeature: null,
      editingFeatureId: null,
      activeUnsavedMeasurementId: null,
      selectedMeasurements: [],
      measure: null,
      pendingMarker: null,
      markerEditorOpen: false,
      profile: null,
      profileVisible: false,
    });
  }, [activeDrawSourceId, adjustingImageSourceId]);

  useEffect(() => {
    const prevTool = prevToolRef.current;
    prevToolRef.current = tool;
    if (prevTool !== tool && tool !== "none") {
      const drawState = useDrawLayerStore.getState();
      if (drawState.activeDrawSourceId !== null) drawState.stopDrawingLayer();
      if (drawState.adjustingImageSourceId !== null) drawState.setAdjustingImageSourceId(null);
    }
  }, [tool]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const syncExtent = () => {
      const size = map.getSize();
      if (!size) return;
      const ext = map.getView().calculateExtent(size);
      if (ext.length === 4 && ext.every(Number.isFinite)) {
        useDrawLayerStore.getState().setCurrentViewExtent3857(ext as Extent3857);
      }
    };
    syncExtent();
    map.on("moveend", syncExtent);
    return () => {
      map.un("moveend", syncExtent);
    };
  }, [mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeDrawSourceId === null) {
      activeVectorSourceRef.current = null;
      return;
    }

    const store = useMapStore.getState();
    if (store.tool !== "none") {
      useMapStore.setState({ tool: "none" });
    }
    const overlayId = `src:${activeDrawSourceId}`;
    if (!overlays.includes(overlayId)) {
      store.toggleOverlay(overlayId);
      return;
    }

    const layer = map
      .getLayers()
      .getArray()
      .find((l) => l.get("drawSourceId") === activeDrawSourceId) as VectorLayer<Feature> | undefined;

    const vectorSource = layer?.getSource() ?? null;
    activeVectorSourceRef.current = vectorSource;
    if (!vectorSource) return;

    const persistCurrent = () => {
      const latestSource = sourcesRef.current.find((s) => s.id === activeDrawSourceId);
      if (!latestSource) return;
      void saveDrawLayerFeatures(latestSource, vectorSource, strokeColorRef.current, strokeWidthRef.current);
    };

    if (drawTool === "modify") {
      const modify = new Modify({ source: vectorSource });
      modify.on("modifyend", persistCurrent);
      map.addInteraction(modify);
      return () => {
        modify.un("modifyend", persistCurrent);
        map.removeInteraction(modify);
      };
    }

    const geomType = drawTool === "freehand" ? "LineString" : drawTool;
    const draw = new Draw({
      source: vectorSource,
      type: geomType,
      freehand: drawTool === "freehand",
    });
    const onDrawEnd = (evt: { feature: Feature }) => {
      evt.feature.setProperties({ color: strokeColorRef.current, width: strokeWidthRef.current });
      window.setTimeout(persistCurrent, 0);
    };
    draw.on("drawend", onDrawEnd);
    map.addInteraction(draw);
    return () => {
      draw.un("drawend", onDrawEnd);
      map.removeInteraction(draw);
    };
  }, [mapRef, activeDrawSourceId, drawTool, overlays, hasActiveDrawSource]);

  useEffect(() => {
    if (undoNonce === lastUndoNonceRef.current) return;
    lastUndoNonceRef.current = undoNonce;
    if (activeDrawSourceId === null) return;
    const sourceObj = sourcesRef.current.find((s) => s.id === activeDrawSourceId);
    const vectorSource = activeVectorSourceRef.current;
    if (!sourceObj || !vectorSource) return;
    const features = vectorSource.getFeatures();
    if (features.length === 0) return;
    vectorSource.removeFeature(features[features.length - 1]);
    void saveDrawLayerFeatures(sourceObj, vectorSource, strokeColorRef.current, strokeWidthRef.current);
  }, [undoNonce, activeDrawSourceId]);

  useImageAdjustInteraction(mapRef, adjustingImageSourceId, sources);
}
