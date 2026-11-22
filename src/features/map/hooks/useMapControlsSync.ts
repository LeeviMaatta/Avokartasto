import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type OlMap from "ol/Map";
import type VectorLayer from "ol/layer/Vector";
import type Feature from "ol/Feature";
import type VectorSource from "ol/source/Vector";
import type TileLayer from "ol/layer/Tile";
import type XYZ from "ol/source/XYZ";
import Zoom from "ol/control/Zoom";
import ScaleLine from "ol/control/ScaleLine";
import Rotate from "ol/control/Rotate";
import FullScreen from "ol/control/FullScreen";
import OverviewMap from "ol/control/OverviewMap";
import TileLayerOl from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import Graticule from "ol/layer/Graticule";
import Stroke from "ol/style/Stroke";
import DoubleClickZoom from "ol/interaction/DoubleClickZoom";
import DragPan from "ol/interaction/DragPan";
import KeyboardZoom from "ol/interaction/KeyboardZoom";
import Kinetic from "ol/Kinetic";
import type { LocalSource } from "../../../infrastructure/tauri";
import type { SelectedMeasurementItem } from "../../measurements/domain/measurementSelection";
import { buildMeasurementLayerStyle } from "./layerSyncShared";
import { createTileDebugLayer } from "./tileDebugLayer";

interface UseMapControlsSyncOptions {
  mapRef: RefObject<OlMap | null>;
  bottomRightRef: RefObject<HTMLDivElement | null>;
  measureLayerRef: RefObject<VectorLayer<Feature> | null>;
  featSrc: MutableRefObject<VectorSource>;
  settings: Record<string, string>;
  basemap: string;
  sources: LocalSource[];
  showTileBoundaries: boolean;
  editingFeatureId: number | null;
  activeUnsavedMeasurementId: string | null;
  selectedMeasurements: SelectedMeasurementItem[];
}

export function useMapControlsSync({
  mapRef,
  bottomRightRef,
  measureLayerRef,
  featSrc,
  settings,
  basemap,
  sources,
  showTileBoundaries,
  editingFeatureId,
  activeUnsavedMeasurementId,
  selectedMeasurements,
}: UseMapControlsSyncOptions) {
  const scaleLineRef = useRef<ScaleLine | null>(null);
  const rotateControlRef = useRef<Rotate | null>(null);
  const fullscreenControlRef = useRef<FullScreen | null>(null);
  const overviewMapControlRef = useRef<OverviewMap | null>(null);
  const graticuleLayerRef = useRef<Graticule | null>(null);
  const tileDebugLayerRef = useRef<TileLayer<XYZ> | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const zoomControl = map.getControls().getArray().find((control) => control instanceof Zoom);
    if (!zoomControl) return;
    const visible = settings.showZoomControls !== "0";
    if (visible && !map.getControls().getArray().includes(zoomControl)) map.addControl(zoomControl);
    if (!visible && map.getControls().getArray().includes(zoomControl)) map.removeControl(zoomControl);
  }, [mapRef, settings.showZoomControls]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const showScale = settings.showScaleLine !== "0";
    if (showScale && !scaleLineRef.current) {
      const scaleLine = new ScaleLine({ units: "metric", target: bottomRightRef.current ?? undefined });
      scaleLineRef.current = scaleLine;
      map.addControl(scaleLine);
    } else if (!showScale && scaleLineRef.current) {
      map.removeControl(scaleLineRef.current);
      scaleLineRef.current = null;
    }
  }, [mapRef, bottomRightRef, settings.showScaleLine]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (settings.enableRotation === "0") {
      map.getView().setRotation(0);
    }
  }, [mapRef, settings.enableRotation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const showCompass = settings.showCompass !== "0";
    if (!showCompass) {
      if (rotateControlRef.current) {
        map.removeControl(rotateControlRef.current);
        rotateControlRef.current = null;
      }
      return;
    }

    const view = map.getView();
    const compassEl = document.createElement("span");
    compassEl.className = "ol-compass inline-flex items-center justify-center";
    compassEl.style.transformOrigin = "center";
    compassEl.style.transition = "transform 75ms linear";
    compassEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" stroke-opacity="0.22" stroke-width="1.2"/>
      <path d="M12 2.2v1.6M12 20.2v1.6M2.2 12h1.6M20.2 12h1.6" stroke="currentColor" stroke-opacity="0.45" stroke-width="1.2" stroke-linecap="round"/>
      <polygon points="12,3.5 14.8,12 12,10.6 9.2,12" fill="#ef4444"/>
      <polygon points="12,20.5 14.8,12 12,13.4 9.2,12" fill="#94a3b8"/>
      <circle cx="12" cy="12" r="1.4" fill="currentColor"/>
    </svg>`;

    const syncCompassRotation = () => {
      compassEl.style.transform = `rotate(${view.getRotation()}rad)`;
    };
    syncCompassRotation();
    view.on("change:rotation", syncCompassRotation);

    if (!rotateControlRef.current) {
      const rotate = new Rotate({
        autoHide: false,
        tipLabel: "Palauta pohjoinen ylös",
        label: compassEl,
        target: document.getElementById("map-compass-slot") ?? bottomRightRef.current ?? undefined,
        resetNorth: () => {
          view.animate({ rotation: 0, duration: 350 });
        },
      });
      rotateControlRef.current = rotate;
      map.addControl(rotate);
    }

    return () => {
      view.un("change:rotation", syncCompassRotation);
      if (rotateControlRef.current) {
        map.removeControl(rotateControlRef.current);
        rotateControlRef.current = null;
      }
    };
  }, [mapRef, bottomRightRef, settings.showCompass]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const showGraticule = settings.showGraticule === "1";
    if (showGraticule && !graticuleLayerRef.current) {
      const graticule = new Graticule({
        strokeStyle: new Stroke({
          color: "rgba(100, 116, 139, 0.4)",
          width: 1,
          lineDash: [4, 4],
        }),
        showLabels: true,
        wrapX: true,
        zIndex: 40,
      });
      graticuleLayerRef.current = graticule;
      map.addLayer(graticule);
    } else if (!showGraticule && graticuleLayerRef.current) {
      map.removeLayer(graticuleLayerRef.current);
      graticuleLayerRef.current = null;
    }
  }, [mapRef, settings.showGraticule]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileDebugLayerRef.current) {
      map.removeLayer(tileDebugLayerRef.current);
      tileDebugLayerRef.current = null;
    }
    if (!showTileBoundaries) return;

    const debugLayer = createTileDebugLayer(map);
    tileDebugLayerRef.current = debugLayer;
    map.addLayer(debugLayer);
    return () => {
      if (tileDebugLayerRef.current === debugLayer) {
        map.removeLayer(debugLayer);
        tileDebugLayerRef.current = null;
      }
    };
  }, [mapRef, showTileBoundaries, basemap, sources, settings.layerViewSettings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const kbZoom = map.getInteractions().getArray().find((i) => i instanceof KeyboardZoom);
    if (kbZoom) kbZoom.setActive(settings.keyboardShortcutsEnabled === "0");
  }, [mapRef, settings.keyboardShortcutsEnabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const dblClickZoom = map.getInteractions().getArray().find((i) => i instanceof DoubleClickZoom);
    if (dblClickZoom) dblClickZoom.setActive(settings.enableDoubleClickZoom === "1");
  }, [mapRef, settings.enableDoubleClickZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const show = settings.showFullscreenControl !== "0";
    if (show && !fullscreenControlRef.current) {
      const fs = new FullScreen({ tipLabel: "Koko ruutu (F11)", target: bottomRightRef.current ?? undefined });
      fullscreenControlRef.current = fs;
      map.addControl(fs);
    } else if (!show && fullscreenControlRef.current) {
      map.removeControl(fullscreenControlRef.current);
      fullscreenControlRef.current = null;
    }
  }, [mapRef, bottomRightRef, settings.showFullscreenControl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const show = settings.showOverviewMap === "1";
    if (show && !overviewMapControlRef.current) {
      const ov = new OverviewMap({
        collapsed: true,
        tipLabel: "Yleiskatsauskartta",
        collapseLabel: "\u00BB",
        label: "\u00AB",
        layers: [new TileLayerOl({ source: new OSM() })],
        target: bottomRightRef.current ?? undefined,
      });
      overviewMapControlRef.current = ov;
      map.addControl(ov);
    } else if (!show && overviewMapControlRef.current) {
      map.removeControl(overviewMapControlRef.current);
      overviewMapControlRef.current = null;
    }
  }, [mapRef, bottomRightRef, settings.showOverviewMap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const interactions = map.getInteractions();
    const dragPanIndex = interactions.getArray().findIndex((i) => i instanceof DragPan);
    const enableKinetic = settings.kineticPanning !== "0";
    if (dragPanIndex !== -1) {
      const newDragPan = new DragPan({
        kinetic: enableKinetic ? new Kinetic(-0.0055, 0.015, 140) : undefined,
      });
      interactions.setAt(dragPanIndex, newDragPan);
    }
  }, [mapRef, settings.kineticPanning]);

  useEffect(() => {
    if (!measureLayerRef.current) return;
    measureLayerRef.current.setStyle(
      buildMeasurementLayerStyle(
        settings,
        editingFeatureId,
        activeUnsavedMeasurementId,
        selectedMeasurements,
      ),
    );
  }, [
    measureLayerRef,
    editingFeatureId,
    activeUnsavedMeasurementId,
    selectedMeasurements,
    settings.showSegmentLengths,
    settings.segmentLengthMinDistance,
    settings.hideSegmentLengthsByZoom,
    settings.segmentLengthsMinZoom,
    settings.measurementUnits,
    settings.savedMeasurementColor,
    settings.unsavedMeasurementColor,
    settings.theme,
    settings.uiStyle,
  ]);

  useEffect(() => {
    featSrc.current.changed();
  }, [
    featSrc,
    settings.uiStyle,
    settings.theme,
    settings.savedMarkerColor,
    settings.unsavedMarkerColor,
    settings.savedMeasurementColor,
  ]);
}
