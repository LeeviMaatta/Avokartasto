import { useEffect, type MutableRefObject, type RefObject } from "react";
import OlMap from "ol/Map";
import View from "ol/View";
import VectorLayer from "ol/layer/Vector";
import type Feature from "ol/Feature";
import { fromLonLat, toLonLat } from "ol/proj";
import type VectorSource from "ol/source/Vector";
import Zoom from "ol/control/Zoom";
import Attribution from "ol/control/Attribution";
import { defaults as defaultControls } from "ol/control";
import Stroke from "ol/style/Stroke";
import { Circle as CircleStyle, Fill, Style, Text as TextStyle } from "ol/style";
import DoubleClickZoom from "ol/interaction/DoubleClickZoom";
import DragRotate from "ol/interaction/DragRotate";
import KeyboardZoom from "ol/interaction/KeyboardZoom";
import { useMapStore } from "../../../store/mapStore";
import { setSetting as persistSetting } from "../../../infrastructure/tauri";
import { lineStyle, markerStyle, measurementStyle } from "../styles/featureStyles";
import { recordDebugEvent, setDebugMap } from "../../debug/services/debugMonitor";
import { focusMapViewport } from "../../../shared/keyboardNavigation";
import { shouldFocusMapOnWheel } from "../../../shared/mapFocus";
import {
  DEFAULT_ROTATION_KEY,
  isModifierKey,
  matchesModifierCombo,
  normalizeRotationKeyString,
  normalizeSingleKey,
  parseRotationKey,
} from "../../settings/model/keyboardShortcuts";

interface UseOlMapInstanceOptions {
  elRef: RefObject<HTMLDivElement | null>;
  bottomRightRef: RefObject<HTMLDivElement | null>;
  mapRef: MutableRefObject<OlMap | null>;
  measureLayerRef: MutableRefObject<VectorLayer<Feature> | null>;
  featSrc: MutableRefObject<VectorSource>;
  measureSrc: MutableRefObject<VectorSource>;
  routeSrc: MutableRefObject<VectorSource>;
  viewRestored: MutableRefObject<boolean>;
  heldKeysByCode: MutableRefObject<Map<string, string>>;
}

export function useOlMapInstance({
  elRef,
  bottomRightRef,
  mapRef,
  measureLayerRef,
  featSrc,
  measureSrc,
  routeSrc,
  viewRestored,
  heldKeysByCode,
}: UseOlMapInstanceOptions) {
  useEffect(() => {
    const mapElement = elRef.current;
    const settings = useMapStore.getState().settings;
    let rafId: number | null = null;
    let centerRafId: number | null = null;
    let saveViewTimeout: number | null = null;
    let pendingCursor: [number, number] | null = null;

    const preventBrowserContextMenu = (event: MouseEvent) => event.preventDefault();
    const focusMapOnWheel = (event: WheelEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      const targetEl = event.target instanceof HTMLElement ? event.target : target?.parentElement ?? null;
      if (
        shouldFocusMapOnWheel({
          targetInsideMap: Boolean(target && mapElement?.contains(target)),
          targetInControlOrEditable: Boolean(targetEl?.closest(".ol-control, input, textarea, select")),
          hasOpenModal: Boolean(document.querySelector('[aria-modal="true"]')),
          mapAlreadyFocused: document.activeElement === mapElement,
        })
      ) {
        focusMapViewport();
      }
    };

    const parsedMinSegDist = Number(settings.segmentLengthMinDistance ?? "500");
    const parsedMinZoom = Number(settings.segmentLengthsMinZoom ?? "13");
    const mLayer = new VectorLayer({
      className: "ol-vector-layer",
      source: measureSrc.current,
      style: measurementStyle(
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
        },
      ),
      zIndex: 100,
    });
    measureLayerRef.current = mLayer;

    const map = new OlMap({
      target: elRef.current!,
      controls: defaultControls({ rotate: false, zoom: false, attribution: false }).extend([
        new Attribution({ target: bottomRightRef.current ?? undefined, collapsible: true }),
        new Zoom({ target: bottomRightRef.current ?? undefined }),
      ]),
      view: new View({ center: fromLonLat([24.94, 60.17]), zoom: 10, maxZoom: 21, enableRotation: true }),
      layers: [
        new VectorLayer({
          className: "ol-vector-layer",
          source: featSrc.current,
          style: (feature) => {
            if (feature.get("isUserLoc")) {
              return new Style({
                image: new CircleStyle({
                  radius: 7,
                  fill: new Fill({ color: "#2563eb" }),
                  stroke: new Stroke({ color: "#ffffff", width: 2.5 }),
                }),
              });
            }
            const {
              theme,
              savedMarkerColor = "#dc2626",
              unsavedMarkerColor = "#f97316",
              savedMeasurementColor = "#16a34a",
            } = useMapStore.getState().settings;
            const resolvedTheme = theme === "dark" ? "dark" : "light";
            if (feature.get("isPending")) return markerStyle(unsavedMarkerColor, resolvedTheme);
            return feature.getGeometry()?.getType() === "Point"
              ? markerStyle(savedMarkerColor, resolvedTheme)
              : lineStyle(savedMeasurementColor);
          },
          zIndex: 90,
        }),
        mLayer,
        new VectorLayer({
          className: "ol-vector-layer",
          source: routeSrc.current,
          zIndex: 95,
          style: (feature) => {
            if (feature.getGeometry()?.getType() === "LineString") {
              return [
                new Style({ stroke: new Stroke({ color: "#ffffff", width: 7, lineCap: "round", lineJoin: "round" }) }),
                new Style({ stroke: new Stroke({ color: "#2563eb", width: 4, lineCap: "round", lineJoin: "round" }) }),
              ];
            }
            const label = String(feature.get("routeLabel") || "");
            const color = String(feature.get("routeColor") || "#2563eb");
            return new Style({
              image: new CircleStyle({ radius: 10, fill: new Fill({ color }), stroke: new Stroke({ color: "#ffffff", width: 2.5 }) }),
              text: new TextStyle({ text: label, fill: new Fill({ color: "#ffffff" }), font: "bold 11px sans-serif", offsetY: 0.5 }),
            });
          },
        }),
      ],
    });

    const onRotationKeyDown = (event: KeyboardEvent) => {
      if (isModifierKey(event.key)) return;
      const key = normalizeSingleKey(event.key, event.code);
      if (key) heldKeysByCode.current.set(event.code || key, key);
    };
    const onRotationKeyUp = (event: KeyboardEvent) => {
      if (isModifierKey(event.key)) return;
      const key = normalizeSingleKey(event.key, event.code);
      heldKeysByCode.current.delete(event.code || key);
    };
    const clearHeldRotationKeys = () => {
      heldKeysByCode.current.clear();
    };
    window.addEventListener("keydown", onRotationKeyDown);
    window.addEventListener("keyup", onRotationKeyUp);
    window.addEventListener("blur", clearHeldRotationKeys);

    const defaultDragRotate = map.getInteractions().getArray().find((i) => i instanceof DragRotate);
    if (defaultDragRotate) map.removeInteraction(defaultDragRotate);
    const customDragRotate = new DragRotate({
      condition: (mapBrowserEvent) => {
        const currentSettings = useMapStore.getState().settings;
        if (currentSettings.enableRotation === "0") return false;
        const orig = mapBrowserEvent.originalEvent;
        if (!(orig instanceof MouseEvent)) return false;
        const normalizedKey =
          normalizeRotationKeyString(currentSettings.rotationKey || DEFAULT_ROTATION_KEY) || DEFAULT_ROTATION_KEY;
        const parsed = parseRotationKey(normalizedKey);
        return matchesModifierCombo(orig, parsed, heldKeysByCode.current);
      },
    });
    (customDragRotate as unknown as { stopDown: (handled: boolean) => boolean }).stopDown = (handled) => handled;
    map.addInteraction(customDragRotate);

    const initialDblClickZoom = map.getInteractions().getArray().find((i) => i instanceof DoubleClickZoom);
    if (initialDblClickZoom) initialDblClickZoom.setActive(settings.enableDoubleClickZoom === "1");
    const initialKbZoom = map.getInteractions().getArray().find((i) => i instanceof KeyboardZoom);
    if (initialKbZoom) initialKbZoom.setActive(settings.keyboardShortcutsEnabled === "0");

    const updateCoords = () => {
      const center = map.getView().getCenter();
      if (!center) return;
      const [lon, lat] = toLonLat(center);
      const prev = useMapStore.getState().centerCoord;
      if (!prev || prev[0] !== lon || prev[1] !== lat) {
        useMapStore.setState({ centerCoord: [lon, lat] });
      }
    };

    map.on("pointermove", (e) => {
      if (e.dragging || map.getView().getInteracting() || map.getView().getAnimating()) return;
      const [lon, lat] = toLonLat(e.coordinate);
      pendingCursor = [lon, lat];
      if (rafId === null) {
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          if (pendingCursor) useMapStore.setState({ cursor: pendingCursor });
        });
      }
    });
    map.getView().on("change:center", () => {
      if (useMapStore.getState().settings.dataFetchMode !== "center") return;
      if (centerRafId !== null) return;
      centerRafId = window.requestAnimationFrame(() => {
        centerRafId = null;
        updateCoords();
      });
    });
    map.on("moveend", updateCoords);
    map.on("moveend", () => {
      if (!viewRestored.current) return;
      if (saveViewTimeout !== null) window.clearTimeout(saveViewTimeout);
      saveViewTimeout = window.setTimeout(() => {
        saveViewTimeout = null;
        const view = map.getView();
        const center = view.getCenter();
        const zoom = view.getZoom();
        if (!center || zoom === undefined) return;
        void persistSetting("lastMapCenter", JSON.stringify(toLonLat(center)));
        void persistSetting("lastMapZoom", String(zoom));
      }, 1000);
    });

    mapElement?.addEventListener("contextmenu", preventBrowserContextMenu);
    mapElement?.addEventListener("wheel", focusMapOnWheel, { capture: true, passive: true });
    mapRef.current = map;
    setDebugMap(map);
    recordDebugEvent("map", "Map initialized");
    updateCoords();

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (centerRafId !== null) window.cancelAnimationFrame(centerRafId);
      if (saveViewTimeout !== null) window.clearTimeout(saveViewTimeout);
      mapElement?.removeEventListener("contextmenu", preventBrowserContextMenu);
      mapElement?.removeEventListener("wheel", focusMapOnWheel, { capture: true });
      window.removeEventListener("keydown", onRotationKeyDown);
      window.removeEventListener("keyup", onRotationKeyUp);
      window.removeEventListener("blur", clearHeldRotationKeys);
      map.getControls().getArray().slice().forEach((control) => map.removeControl(control));
      map.setTarget(undefined);
      mapRef.current = null;
      setDebugMap(null);
    };
  }, []);
}
