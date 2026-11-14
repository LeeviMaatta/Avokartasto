import { useEffect, useRef, useState } from "react";
import OlMap from "ol/Map";
import View from "ol/View";
import BaseLayer from "ol/layer/Base";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import Point from "ol/geom/Point";
import Feature from "ol/Feature";
import { fromLonLat, toLonLat } from "ol/proj";
import { getArea, getLength } from "ol/sphere";
import "ol/ol.css";
import { useMapStore } from "../../store/mapStore";
import { setSetting as persistSetting } from "../../infrastructure/tauriBridge";
import { elevationBatch } from "../location-info/elevationService";
import Zoom from "ol/control/Zoom";
import Attribution from "ol/control/Attribution";
import ScaleLine from "ol/control/ScaleLine";
import Rotate from "ol/control/Rotate";
import { defaults as defaultControls } from "ol/control";
import FullScreen from "ol/control/FullScreen";
import OverviewMap from "ol/control/OverviewMap";
import TileLayer from "ol/layer/Tile";
import VectorTileLayer from "ol/layer/VectorTile";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import type ImageTile from "ol/ImageTile";
import Graticule from "ol/layer/Graticule";
import Stroke from "ol/style/Stroke";
import { Circle as CircleStyle, Fill, Style, Text as TextStyle } from "ol/style";
import DoubleClickZoom from "ol/interaction/DoubleClickZoom";
import DragPan from "ol/interaction/DragPan";
import DragRotate from "ol/interaction/DragRotate";
import KeyboardZoom from "ol/interaction/KeyboardZoom";
import Kinetic from "ol/Kinetic";
import { LocateFixed } from "lucide-react";
import { requestConfirmation } from "../../app/confirmation";
import { lineStyle, markerStyle, measurementStyle } from "./styles/featureStyles";
import {
  clearSavedEditFeatures,
  ensureUnsavedMeasurementId,
  findTargetMeasurementFeature,
  removeUnsavedMeasurementByGeojson,
  removeUnsavedMeasurementById,
} from "../measurements/domain/measurementSource";
import { useMapMeasurementInteractions } from "./hooks/useMapMeasurementInteractions";
import { useMapFeatures } from "./hooks/useMapFeatures";
import { useMapLayers } from "./hooks/useMapLayers";
import FeatureContextMenu from "./components/FeatureContextMenu";
import { recordDebugEvent, setDebugMap } from "../debug/debugMonitor";
import { useDebugStore } from "../debug/debugStore";
import { focusMapViewport } from "../../shared/keyboardNavigation";
import { shouldFocusMapOnWheel } from "../../shared/mapFocus";
import {
  DEFAULT_ARROW_ZOOM_KEY,
  DEFAULT_ROTATION_KEY,
  isModifierKey,
  isTextInputTarget,
  matchesModifierCombo,
  normalizeRotationKeyString,
  normalizeSingleKey,
  parseRotationKey,
} from "../settings/model/keyboardShortcuts";

export default function MapContainer() {
  const el = useRef<HTMLDivElement>(null);
  const bottomRightRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OlMap | null>(null);
  const overlayRefs = useRef<BaseLayer[]>([]);
  const measureSrc = useRef(new VectorSource());
  const featSrc = useRef(new VectorSource());
  const routeSrc = useRef(new VectorSource());
  const pendingMarkerFeature = useRef<Feature | null>(null);
  const profileRequest = useRef(0);
  const viewRestored = useRef(false);
  const scaleLineRef = useRef<ScaleLine | null>(null);
  const rotateControlRef = useRef<Rotate | null>(null);
  const fullscreenControlRef = useRef<FullScreen | null>(null);
  const overviewMapControlRef = useRef<OverviewMap | null>(null);
  const graticuleLayerRef = useRef<Graticule | null>(null);
  const tileDebugLayerRef = useRef<TileLayer<XYZ> | null>(null);
  const measureLayerRef = useRef<VectorLayer<Feature> | null>(null);
  const userLocFeatureRef = useRef<Feature | null>(null);

  const [locating, setLocating] = useState(false);
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const basemap = useMapStore((s) => s.basemap);
  const overlays = useMapStore((s) => s.overlays);
  const overlayOrder = useMapStore((s) => s.overlayOrder);
  const settings = useMapStore((s) => s.settings);
  const sources = useMapStore((s) => s.sources);
  const tool = useMapStore((s) => s.tool);
  const routePoints = useMapStore((s) => s.routePoints);
  const routeResult = useMapStore((s) => s.routeResult);
  const routePickTarget = useMapStore((s) => s.routePickTarget);
  const pendingMarker = useMapStore((s) => s.pendingMarker);
  const featuresVersion = useMapStore((s) => s.featuresVersion);
  const editingFeatureId = useMapStore((s) => s.editingFeatureId);
  const activeUnsavedMeasurementId = useMapStore((s) => s.activeUnsavedMeasurementId);
  const hiddenFeaturesSetting = useMapStore((s) => s.settings.hiddenFeatures);
  const showTileBoundaries = useDebugStore((s) => Boolean(s.settings.showTileBoundaries));
  
  const showCenterCrosshair = settings.showCenterCrosshair !== "0";
  const showLayerErrors = settings.showLayerErrors !== "0";
  const crosshairColor = settings.crosshairColor || "#dc2626";
  const rawOverlayOpacity = Number(settings.uiOverlayOpacity ?? "1");
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;

  const [contextMenu, setContextMenu] = useState<{ feature: Feature; x: number; y: number; savedId?: number } | null>(null);
  const { baseLayerError } = useMapLayers({ mapRef, overlayRefs, basemap, overlays, overlayOrder, settings, sources });

  useEffect(() => {
    const mapElement = el.current;
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
    const removeMeasurementFeature = (event: Event) => {
      const detail = (event as CustomEvent<{ savedId?: number | null; unsavedId?: string | null; geojson?: string }>).detail;
      if (detail?.savedId !== undefined && detail?.savedId !== null) {
        clearSavedEditFeatures(measureSrc.current, detail.savedId);
      } else {
        if (detail?.unsavedId) {
          removeUnsavedMeasurementById(measureSrc.current, detail.unsavedId);
        }
        if (detail?.geojson) {
          removeUnsavedMeasurementByGeojson(measureSrc.current, detail.geojson);
        }
      }
      profileRequest.current += 1;
    };
    const loadLineProfile = async (geom: LineString) => {
      const length = getLength(geom, { projection: "EPSG:3857" });
      const reqId = ++profileRequest.current;
      const n = Math.min(100, Math.max(2, Math.ceil(length / 100) + 1));
      const fractions = Array.from({ length: n }, (_, i) => i / (n - 1));
      const pts = fractions.map((f) => toLonLat(geom.getCoordinateAt(f)) as [number, number]);
      try {
        const elev = await elevationBatch(pts);
        if (reqId !== profileRequest.current) return;
        useMapStore.setState({ profile: fractions.map((f, i) => ({ dist: f * length, elev: elev[i] })), profileVisible: false });
      } catch (err) {
        if (reqId === profileRequest.current) useMapStore.setState({ profileError: String(err) });
      }
    };
    const handleOpenMeasurementEditor = (event: Event) => {
      const detail = (event as CustomEvent<{ id: number; geojson: string; folder_id?: string | null }>).detail;
      if (!detail?.geojson) return;
      try {
        const geometry = new GeoJSON().readGeometry(JSON.parse(detail.geojson), {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });
        clearSavedEditFeatures(measureSrc.current);
        const state = useMapStore.getState();
        let isHidden = false;
        try {
          const hiddenIds: unknown = JSON.parse(state.settings.hiddenFeatures ?? "[]");
          if (Array.isArray(hiddenIds) && hiddenIds.includes(detail.id)) isHidden = true;
        } catch {
          // Sivuutetaan virheellinen JSON
        }
        if (!isHidden && detail.folder_id) {
          try {
            const folders = JSON.parse(state.settings.markerFolders ?? "[]") as Array<{ id?: string; visible?: boolean }>;
            if (Array.isArray(folders) && folders.some((folder) => folder?.id === detail.folder_id && folder.visible === false)) {
              isHidden = true;
            }
          } catch {
            // Sivuutetaan virheellinen JSON
          }
        }
        if (!isHidden) {
          const editable = new Feature({ geometry });
          editable.set("id", detail.id);
          measureSrc.current.addFeature(editable);
        }
        if (geometry instanceof LineString) {
          void loadLineProfile(geometry);
        }
      } catch (error) {
        console.error("Muokattavan mittauksen geometriaa ei voitu ladata kartalle", error);
      }
    };
    const replaceMeasurementGeometry = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          savedId?: number | null;
          unsavedId?: string | null;
          geojson?: string;
          profile?: Array<{ dist: number; elev: number | null }> | null;
        }>
      ).detail;
      if (!detail?.geojson) return;
      try {
        const geometry = new GeoJSON().readGeometry(JSON.parse(detail.geojson), {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });
        if (!(geometry instanceof LineString)) return;
        const targetFeature =
          findTargetMeasurementFeature(
            measureSrc.current,
            detail.savedId ?? null,
            detail.unsavedId ?? null,
          ) ??
          measureSrc.current.getFeatures().find((f) => f.getGeometry() instanceof LineString) ??
          null;
        if (targetFeature) {
          targetFeature.setGeometry(geometry);
        }
        const length = getLength(geometry, { projection: "EPSG:3857" });
        if (detail.profile && detail.profile.length > 0) {
          profileRequest.current += 1;
          useMapStore.setState({
            measure: { length, geojson: detail.geojson, kind: "distance" },
            profile: detail.profile,
            profileError: null,
          });
        } else {
          useMapStore.setState({
            measure: { length, geojson: detail.geojson, kind: "distance" },
            profile: null,
            profileError: null,
          });
          void loadLineProfile(geometry);
        }
      } catch (error) {
        console.error("Mittausgeometrian päivitys epäonnistui", error);
      }
    };
    const handleSearchLocation = (event: Event) => {
      const detail = (event as CustomEvent<{ lat: number; lon: number; zoom?: number }>).detail;
      if (!detail || !Number.isFinite(detail.lat) || !Number.isFinite(detail.lon)) return;
      const targetZoom = typeof detail.zoom === "number" && Number.isFinite(detail.zoom)
        ? detail.zoom
        : Math.max(map.getView().getZoom() ?? 10, 14);
      map.getView().animate({ center: fromLonLat([detail.lon, detail.lat]), zoom: targetZoom, duration: 500 });
    };
    mapElement?.addEventListener("contextmenu", preventBrowserContextMenu);
    mapElement?.addEventListener("wheel", focusMapOnWheel, { capture: true, passive: true });
    window.addEventListener("remove-measurement-feature", removeMeasurementFeature);
    window.addEventListener("open-measurement-editor", handleOpenMeasurementEditor);
    window.addEventListener("replace-measurement-geometry", replaceMeasurementGeometry);

    const map = new OlMap({
      target: el.current!,
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
              uiStyle,
              theme,
              savedMarkerColor = "#dc2626",
              unsavedMarkerColor = "#f97316",
              savedMeasurementColor = "#16a34a",
            } = useMapStore.getState().settings;
            const resolvedUiStyle = uiStyle === "classic" || uiStyle === "retro" ? uiStyle : "modern";
            const resolvedTheme = theme === "dark" ? "dark" : "light";
            if (feature.get("isPending")) {
              return markerStyle(unsavedMarkerColor, resolvedUiStyle, resolvedTheme);
            }
            return feature.getGeometry()?.getType() === "Point"
              ? markerStyle(savedMarkerColor, resolvedUiStyle, resolvedTheme)
              : lineStyle(savedMeasurementColor);
          },
          zIndex: 90,
        }),
        (() => {
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
          return mLayer;
        })(),
        new VectorLayer({
          className: "ol-vector-layer",
          source: routeSrc.current,
          zIndex: 95,
          style: (feature) => {
            if (feature.getGeometry()?.getType() === "LineString") {
              return [
                new Style({
                  stroke: new Stroke({ color: "#ffffff", width: 7, lineCap: "round", lineJoin: "round" }),
                }),
                new Style({
                  stroke: new Stroke({ color: "#2563eb", width: 4, lineCap: "round", lineJoin: "round" }),
                }),
              ];
            }
            const label = String(feature.get("routeLabel") || "");
            const color = String(feature.get("routeColor") || "#2563eb");
            return new Style({
              image: new CircleStyle({
                radius: 10,
                fill: new Fill({ color }),
                stroke: new Stroke({ color: "#ffffff", width: 2.5 }),
              }),
              text: new TextStyle({
                text: label,
                fill: new Fill({ color: "#ffffff" }),
                font: "bold 11px sans-serif",
                offsetY: 0.5,
              }),
            });
          },
        }),
      ],
    });
    const heldKeysByCode = new Map<string, string>();
    const onRotationKeyDown = (event: KeyboardEvent) => {
      if (isModifierKey(event.key)) return;
      const key = normalizeSingleKey(event.key, event.code);
      if (key) heldKeysByCode.set(event.code || key, key);
    };
    const onRotationKeyUp = (event: KeyboardEvent) => {
      if (isModifierKey(event.key)) return;
      const key = normalizeSingleKey(event.key, event.code);
      heldKeysByCode.delete(event.code || key);
    };
    const clearHeldRotationKeys = () => {
      heldKeysByCode.clear();
    };
    window.addEventListener("keydown", onRotationKeyDown);
    window.addEventListener("keyup", onRotationKeyUp);
    window.addEventListener("blur", clearHeldRotationKeys);

    const defaultDragRotate = map.getInteractions().getArray().find((i) => i instanceof DragRotate);
    if (defaultDragRotate) {
      map.removeInteraction(defaultDragRotate);
    }
    const customDragRotate = new DragRotate({
      condition: (mapBrowserEvent) => {
        const currentSettings = useMapStore.getState().settings;
        if (currentSettings.enableRotation === "0") return false;
        const orig = mapBrowserEvent.originalEvent;
        if (!(orig instanceof MouseEvent)) return false;
        const normalizedKey =
          normalizeRotationKeyString(currentSettings.rotationKey || DEFAULT_ROTATION_KEY) || DEFAULT_ROTATION_KEY;
        const parsed = parseRotationKey(normalizedKey);
        return matchesModifierCombo(orig, parsed, heldKeysByCode);
      },
    });
    (customDragRotate as unknown as { stopDown: (handled: boolean) => boolean }).stopDown = (handled) => handled;
    map.addInteraction(customDragRotate);

    const onMapArrowZoomKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      if (isTextInputTarget(event.target)) return;
      const currentSettings = useMapStore.getState().settings;
      const normalizedKey =
        normalizeRotationKeyString(currentSettings.arrowZoomKey || DEFAULT_ARROW_ZOOM_KEY) || DEFAULT_ARROW_ZOOM_KEY;
      const parsed = parseRotationKey(normalizedKey, DEFAULT_ARROW_ZOOM_KEY);
      if (!matchesModifierCombo(event, parsed, heldKeysByCode)) return;
      event.preventDefault();
      event.stopPropagation();
      const view = map.getView();
      const z = view.getZoom();
      if (z === undefined) return;
      const nextZoom = event.key === "ArrowUp" ? Math.min(21, z + 1) : Math.max(0, z - 1);
      view.animate({ zoom: nextZoom, duration: 150 });
    };
    mapElement?.addEventListener("keydown", onMapArrowZoomKeyDown, { capture: true });

    const initialDblClickZoom = map.getInteractions().getArray().find((i) => i instanceof DoubleClickZoom);
    if (initialDblClickZoom) {
      initialDblClickZoom.setActive(settings.enableDoubleClickZoom === "1");
    }
    const initialKbZoom = map.getInteractions().getArray().find((i) => i instanceof KeyboardZoom);
    if (initialKbZoom) {
      initialKbZoom.setActive(settings.keyboardShortcutsEnabled === "0");
    }
    window.addEventListener("map-search-location", handleSearchLocation);
    window.addEventListener("map-focus", handleSearchLocation);
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

    map.on("singleclick", async (e) => {
      const state = useMapStore.getState();
      if (state.tool === "route" && state.routePickTarget !== null) {
        const [lon, lat] = toLonLat(e.coordinate);
        state.setRoutePoint(state.routePickTarget, {
          coord: [lon, lat],
          label: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`,
        });
        return;
      }

      // Klikkaus olemassa olevaan kohteeseen -> näytä tiedot / laske profiili
      const clickedFeature = map.forEachFeatureAtPixel(e.pixel, (feat) => {
        if (measureSrc.current.hasFeature(feat as Feature) || featSrc.current.hasFeature(feat as Feature)) return feat;
        return undefined;
      }, { hitTolerance: 12 }) as Feature | undefined;

      if (clickedFeature) {
        const feature = clickedFeature;
        const geom = feature.getGeometry();
        const rawId = feature.get("id");
        const savedId = feature !== pendingMarkerFeature.current && rawId !== undefined && rawId !== null ? Number(rawId) : null;
        const saved = savedId !== null && Number.isFinite(savedId);
        if (saved && geom instanceof Point) {
          clearSavedEditFeatures(measureSrc.current);
          useMapStore.setState({
            selectedFeature: {
              id: savedId,
              kind: "marker",
              title: String(feature.get("title") || "Merkki"),
              description: feature.get("description") ?? null,
              color: feature.get("color") || "#dc2626",
              folder_id: feature.get("folder_id") ?? null,
              geojson: new GeoJSON().writeGeometry(geom, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }),
            },
            editingFeatureId: null,
            activeUnsavedMeasurementId: null,
            measure: null,
            profile: null,
            profileVisible: false,
            profileError: null,
            tool: "none",
          });
          return;
        }
        if (!(geom instanceof LineString) && !(geom instanceof Polygon)) return;
        const kind = geom instanceof Polygon ? "area" : "distance";
        const length = kind === "area" ? getArea(geom, { projection: "EPSG:3857" }) : getLength(geom, { projection: "EPSG:3857" });
        const geojson = new GeoJSON().writeGeometry(geom, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
        let nextUnsavedId: string | null = null;
        if (saved) {
          clearSavedEditFeatures(measureSrc.current);
          const editable = feature.clone();
          editable.set("id", savedId);
          measureSrc.current.addFeature(editable);
        } else {
          clearSavedEditFeatures(measureSrc.current);
          nextUnsavedId = ensureUnsavedMeasurementId(feature);
        }
        useMapStore.setState({
          pendingMarker: null,
          markerEditorOpen: false,
          measure: { length, geojson, kind },
          profile: null,
          profileVisible: false,
          profileError: null,
          editingFeatureId: saved ? savedId : null,
          activeUnsavedMeasurementId: saved ? null : nextUnsavedId,
          selectedFeature: saved
            ? {
                id: savedId,
                kind: "measurement",
                title: String(feature.get("title") || "Mittaus"),
                description: feature.get("description") ?? null,
                color: feature.get("color") || "#dc2626",
                folder_id: feature.get("folder_id") ?? null,
                geojson,
              }
            : null,
        });

        if (geom instanceof LineString) {
          await loadLineProfile(geom);
        }
      }
    });

    const handleDblClickReset = () => {
      const state = useMapStore.getState();
      if (state.settings.removePendingMarkerOnDblClick === "0") return false;
      if (state.editingFeatureId !== null || (state.activeUnsavedMeasurementId !== null && state.tool !== "measure")) {
        if (state.editingFeatureId !== null) {
          clearSavedEditFeatures(measureSrc.current);
        }
        profileRequest.current += 1;
        useMapStore.setState({
          editingFeatureId: null,
          activeUnsavedMeasurementId: null,
          measure: null,
          selectedFeature: null,
          profile: null,
          profileVisible: false,
          profileError: null,
        });
        return true;
      }
      if (state.tool === "measure") return false;
      if (!state.pendingMarker && !pendingMarkerFeature.current) return false;
      if (pendingMarkerFeature.current) {
        featSrc.current.removeFeature(pendingMarkerFeature.current);
        pendingMarkerFeature.current = null;
      }
      useMapStore.setState({ pendingMarker: null, markerEditorOpen: false });
      return true;
    };

    map.on("dblclick", (e) => {
      if (e.originalEvent instanceof MouseEvent && e.originalEvent.button !== 0) return;
      if (handleDblClickReset()) {
        e.preventDefault();
        return false;
      }
    });

    // Oikea klikkaus mittausviivalla
    const viewport = map.getViewport();
    const handleDblClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (handleDblClickReset()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    viewport.addEventListener("dblclick", handleDblClick);
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const pixel = map.getEventPixel(e);
      let clickedFeature: Feature | null = null;
      let savedId: number | undefined;
      map.forEachFeatureAtPixel(pixel, (feat) => {
        const feature = feat as Feature;
        if (measureSrc.current.hasFeature(feature) || featSrc.current.hasFeature(feature)) {
          clickedFeature = feat as Feature;
          if (feature !== pendingMarkerFeature.current && feature.get("id") != null) savedId = Number(feature.get("id"));
          return true;
        }
      }, { hitTolerance: 12 });
      const selectedFeature = clickedFeature as Feature | null;
      if (selectedFeature) {
        if (savedId !== undefined) {
          useMapStore.setState({
            selectedFeature: {
              id: savedId,
              kind: selectedFeature.getGeometry() instanceof Point ? "marker" : "measurement",
              title: String(selectedFeature.get("title") || "Mittaus"),
              description: selectedFeature.get("description") ?? null,
              color: selectedFeature.get("color") || "#dc2626",
              folder_id: selectedFeature.get("folder_id") ?? null,
              geojson: selectedFeature.getGeometry()
                ? new GeoJSON().writeGeometry(selectedFeature.getGeometry()!, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" })
                : undefined,
            },
          });
        }
        setContextMenu({ feature: selectedFeature, x: pixel[0], y: pixel[1], savedId });
      } else {
        setContextMenu(null);
        const [lon, lat] = toLonLat(map.getEventCoordinate(e));
        useMapStore.setState({
          pendingMarker: [lon, lat],
          tool: "none",
          markerEditorOpen: false,
        });
      }
    };
    viewport.addEventListener("contextmenu", handleContextMenu);
    const closeContextMenuOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-feature-context-menu]")) setContextMenu(null);
    };
    document.addEventListener("pointerdown", closeContextMenuOutside);

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
      mapElement?.removeEventListener("keydown", onMapArrowZoomKeyDown, { capture: true });
      window.removeEventListener("remove-measurement-feature", removeMeasurementFeature);
      window.removeEventListener("open-measurement-editor", handleOpenMeasurementEditor);
      window.removeEventListener("replace-measurement-geometry", replaceMeasurementGeometry);
      window.removeEventListener("map-search-location", handleSearchLocation);
      window.removeEventListener("map-focus", handleSearchLocation);
      window.removeEventListener("keydown", onRotationKeyDown);
      window.removeEventListener("keyup", onRotationKeyUp);
      window.removeEventListener("blur", clearHeldRotationKeys);
      if (viewRestored.current) {
        const view = map.getView();
        const center = view.getCenter();
        const zoom = view.getZoom();
        if (center && zoom !== undefined) {
          void persistSetting("lastMapCenter", JSON.stringify(toLonLat(center)));
          void persistSetting("lastMapZoom", String(zoom));
        }
      }
      map.getControls().getArray().slice().forEach((control) => map.removeControl(control));
      scaleLineRef.current = null;
      rotateControlRef.current = null;
      fullscreenControlRef.current = null;
      overviewMapControlRef.current = null;
      map.setTarget(undefined);
      mapRef.current = null;
      setDebugMap(null);
      viewport.removeEventListener("contextmenu", handleContextMenu);
      viewport.removeEventListener("dblclick", handleDblClick);
      document.removeEventListener("pointerdown", closeContextMenuOutside);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const zoomControl = map.getControls().getArray().find((control) => control instanceof Zoom);
    if (!zoomControl) return;
    const visible = settings.showZoomControls !== "0";
    if (visible && !map.getControls().getArray().includes(zoomControl)) map.addControl(zoomControl);
    if (!visible && map.getControls().getArray().includes(zoomControl)) map.removeControl(zoomControl);
  }, [settings.showZoomControls]);

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
  }, [settings.showScaleLine]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const canRotate = settings.enableRotation !== "0";
    if (!canRotate) {
      map.getView().setRotation(0);
    }
  }, [settings.enableRotation]);

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
          view.animate({
            rotation: 0,
            duration: 350,
          });
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
  }, [settings.showCompass]);

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
  }, [settings.showGraticule]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileDebugLayerRef.current) {
      map.removeLayer(tileDebugLayerRef.current);
      tileDebugLayerRef.current = null;
    }

    if (!showTileBoundaries) return;

    const projection = map.getView().getProjection();
    const basemapLayers = map
      .getLayers()
      .getArray()
      .filter((layer) => layer.get("avokartasto-layer-type") === "basemap");
    const basemapLayer = basemapLayers[basemapLayers.length - 1];
    const basemapSource =
      basemapLayer instanceof TileLayer || basemapLayer instanceof VectorTileLayer
        ? basemapLayer.getSource()
        : null;
    const tileGrid =
      basemapSource && "getTileGridForProjection" in basemapSource
        ? (basemapSource.getTileGridForProjection(projection) ?? undefined)
        : undefined;

    const debugSource = new XYZ({
      opaque: false,
      projection,
      tileGrid,
      wrapX: true,
      url: "z:{z} x:{x} y:{y}",
      tileLoadFunction: (tile, text) => {
        const z = tile.getTileCoord()[0];
        const rawSize = (tileGrid ?? debugSource.getTileGridForProjection(projection))?.getTileSize(z) ?? 256;
        const [width, height] = Array.isArray(rawSize) ? rawSize : [rawSize, rawSize];
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.strokeStyle = "rgba(239, 68, 68, 0.78)";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

          ctx.font = "bold 13px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
          ctx.lineWidth = 3.5;
          ctx.strokeText(text, width / 2, height / 2, width - 12);
          ctx.fillStyle = "rgba(185, 28, 28, 0.95)";
          ctx.fillText(text, width / 2, height / 2, width - 12);
        }
        (tile as ImageTile).setImage(canvas);
      },
    });

    const debugLayer = new TileLayer({
      className: "ol-vector-layer",
      source: debugSource,
      zIndex: 85,
    });
    debugLayer.set("avokartasto-layer-type", "debug");
    tileDebugLayerRef.current = debugLayer;
    map.addLayer(debugLayer);

    return () => {
      if (tileDebugLayerRef.current === debugLayer) {
        map.removeLayer(debugLayer);
        tileDebugLayerRef.current = null;
      }
    };
  }, [showTileBoundaries, basemap, sources, settings.layerViewSettings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const kbZoom = map.getInteractions().getArray().find((i) => i instanceof KeyboardZoom);
    if (kbZoom) {
      kbZoom.setActive(settings.keyboardShortcutsEnabled === "0");
    }
  }, [settings.keyboardShortcutsEnabled]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const dblClickZoom = map.getInteractions().getArray().find((i) => i instanceof DoubleClickZoom);
    if (dblClickZoom) {
      dblClickZoom.setActive(settings.enableDoubleClickZoom === "1");
    }
  }, [settings.enableDoubleClickZoom]);

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
  }, [settings.showFullscreenControl]);

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
        layers: [new TileLayer({ source: new OSM() })],
        target: bottomRightRef.current ?? undefined,
      });
      overviewMapControlRef.current = ov;
      map.addControl(ov);
    } else if (!show && overviewMapControlRef.current) {
      map.removeControl(overviewMapControlRef.current);
      overviewMapControlRef.current = null;
    }
  }, [settings.showOverviewMap]);

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
  }, [settings.kineticPanning]);

  useEffect(() => {
    if (!measureLayerRef.current) return;
    const showSegments = settings.showSegmentLengths !== "0";
    const units = settings.measurementUnits ?? "metric";
    const parsedMinSegDist = Number(settings.segmentLengthMinDistance ?? "500");
    const parsedMinZoom = Number(settings.segmentLengthsMinZoom ?? "13");
    measureLayerRef.current.setStyle(
      measurementStyle(
        {
          saved: settings.savedMeasurementColor || "#16a34a",
          unsaved: settings.unsavedMeasurementColor || "#2563eb",
        },
        showSegments,
        units,
        {
          minSegmentDistanceM: Number.isFinite(parsedMinSegDist) ? parsedMinSegDist : 500,
          hideByZoom: settings.hideSegmentLengthsByZoom !== "0",
          minZoomForSegments: Number.isFinite(parsedMinZoom) ? parsedMinZoom : 13,
        },
      ),
    );
  }, [
    settings.showSegmentLengths,
    settings.segmentLengthMinDistance,
    settings.hideSegmentLengthsByZoom,
    settings.segmentLengthsMinZoom,
    settings.measurementUnits,
    settings.savedMeasurementColor,
    settings.unsavedMeasurementColor,
  ]);

  useEffect(() => {
    if (userLocFeatureRef.current) {
      featSrc.current.removeFeature(userLocFeatureRef.current);
      userLocFeatureRef.current = null;
    }
    if (!userLoc) return;
    const feat = new Feature({
      geometry: new Point(fromLonLat(userLoc)),
      color: "#2563eb",
      isUserLoc: true,
    });
    featSrc.current.addFeature(feat);
    userLocFeatureRef.current = feat;
  }, [userLoc]);

  const locateUserRef = useRef<() => void>(() => {});
  const handleLocateUser = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Järjestelmä ei tue paikannusta.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lon = pos.coords.longitude;
        const lat = pos.coords.latitude;
        setUserLoc([lon, lat]);
        const map = mapRef.current;
        if (map) {
          map.getView().animate({
            center: fromLonLat([lon, lat]),
            zoom: Math.max(map.getView().getZoom() ?? 10, 15),
            duration: 700,
          });
        }
      },
      (err) => {
        setLocating(false);
        recordDebugEvent("geolocation", err.message || "Geolocation failed", "warning");
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Sijainnin käyttö estetty. Salli sijainti käyttöjärjestelmän asetuksista."
            : "Oman sijainnin haku epäonnistui.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  locateUserRef.current = handleLocateUser;

  useEffect(() => {
    const onMapAction = (event: Event) => {
      const action = (event as CustomEvent<string>).detail;
      const map = mapRef.current;
      if (!map) return;
      const view = map.getView();
      switch (action) {
        case "zoomIn": {
          const z = view.getZoom();
          if (z !== undefined) view.animate({ zoom: Math.min(21, z + 1), duration: 150 });
          break;
        }
        case "zoomOut": {
          const z = view.getZoom();
          if (z !== undefined) view.animate({ zoom: Math.max(0, z - 1), duration: 150 });
          break;
        }
        case "locateUser":
          locateUserRef.current();
          break;
        case "resetRotation":
          view.animate({ rotation: 0, duration: 200 });
          break;
        case "toggleFullscreen":
          if (document.fullscreenElement) {
            void document.exitFullscreen().catch(() => {});
          } else {
            void document.documentElement.requestFullscreen?.().catch(() => {});
          }
          break;
      }
    };
    window.addEventListener("kb-map-action", onMapAction);
    return () => window.removeEventListener("kb-map-action", onMapAction);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || viewRestored.current || Object.keys(settings).length === 0) return;
    const center = (() => {
      try {
        const initialVal = settings.initialMapCenter ? JSON.parse(settings.initialMapCenter) : null;
        if (Array.isArray(initialVal) && initialVal.length === 2 && initialVal.every((item) => typeof item === "number" && Number.isFinite(item))) {
          return fromLonLat(initialVal as [number, number]);
        }
        const value = JSON.parse(settings.lastMapCenter ?? "");
        return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number" && Number.isFinite(item))
          ? fromLonLat(value as [number, number])
          : null;
      } catch {
        return null;
      }
    })();
    const initialZoom = Number(settings.initialMapZoom);
    const zoom = Number.isFinite(initialZoom) ? initialZoom : Number(settings.lastMapZoom);
    if (center) map.getView().setCenter(center);
    if (Number.isFinite(zoom)) map.getView().setZoom(Math.max(0, Math.min(21, zoom)));
    viewRestored.current = true;
  }, [settings]);

  useEffect(() => {
    featSrc.current.changed();
  }, [
    settings.uiStyle,
    settings.theme,
    settings.savedMarkerColor,
    settings.unsavedMarkerColor,
    settings.savedMeasurementColor,
  ]);

  useEffect(() => {
    if (pendingMarkerFeature.current) {
      featSrc.current.removeFeature(pendingMarkerFeature.current);
      pendingMarkerFeature.current = null;
    }
    if (!pendingMarker || !mapRef.current) return;
    const feature = new Feature({
      geometry: new Point(fromLonLat(pendingMarker)),
      isPending: true,
    });
    featSrc.current.addFeature(feature);
    pendingMarkerFeature.current = feature;
  }, [pendingMarker]);

  useEffect(() => {
    routeSrc.current.clear();
    if (routeResult && routeResult.coordinates.length >= 2) {
      const lineCoords = routeResult.coordinates.map((c) => fromLonLat(c));
      const lineFeature = new Feature({
        geometry: new LineString(lineCoords),
      });
      routeSrc.current.addFeature(lineFeature);
      const map = mapRef.current;
      if (map) {
        const extent = lineFeature.getGeometry()?.getExtent();
        if (extent) {
          map.getView().fit(extent, { padding: [80, 80, 80, 80], duration: 400, maxZoom: 15 });
        }
      }
    }
    routePoints.forEach((pt, idx) => {
      if (!pt) return;
      const isStart = idx === 0;
      const isEnd = idx === routePoints.length - 1;
      const routeLabel = isStart ? "A" : isEnd ? "B" : String(idx);
      const routeColor = isStart ? "#16a34a" : isEnd ? "#dc2626" : "#2563eb";
      routeSrc.current.addFeature(
        new Feature({
          geometry: new Point(fromLonLat(pt.coord)),
          routeLabel,
          routeColor,
        }),
      );
    });
  }, [routePoints, routeResult]);

  useEffect(() => {
    const mapElement = el.current;
    if (!mapElement) return;
    if (tool === "route" && routePickTarget !== null) {
      mapElement.style.cursor = "crosshair";
    } else {
      mapElement.style.cursor = "";
    }
  }, [tool, routePickTarget]);

  useEffect(() => {
    const state = useMapStore.getState();
    const hiddenIds = new Set<number>();
    try {
      const parsed = JSON.parse(hiddenFeaturesSetting ?? "[]");
      if (Array.isArray(parsed)) {
        parsed.forEach((id) => {
          if (Number.isInteger(id)) hiddenIds.add(id);
        });
      }
    } catch {
      // Sivuutetaan virheellinen JSON
    }
    const hiddenFolderIds = new Set<string>();
    try {
      const parsedFolders = JSON.parse(settings.markerFolders ?? "[]") as Array<{ id?: string; visible?: boolean }>;
      if (Array.isArray(parsedFolders)) {
        parsedFolders.forEach((folder) => {
          if (typeof folder?.id === "string" && folder.visible === false) {
            hiddenFolderIds.add(folder.id);
          }
        });
      }
    } catch {
      // Sivuutetaan virheellinen JSON
    }

    hiddenIds.forEach((id) => clearSavedEditFeatures(measureSrc.current, id));

    const editedId = state.editingFeatureId;
    const editedHidden =
      editedId !== null &&
      (hiddenIds.has(editedId) ||
        (state.selectedFeature?.id === editedId &&
          Boolean(state.selectedFeature.folder_id) &&
          hiddenFolderIds.has(state.selectedFeature.folder_id!)));

    if (editedHidden && editedId !== null) {
      clearSavedEditFeatures(measureSrc.current, editedId);
      profileRequest.current += 1;
      useMapStore.setState({
        editingFeatureId: null,
        measure: null,
        profile: null,
        profileVisible: false,
        profileError: null,
        selectedFeature: null,
      });
      return;
    }

    const sel = state.selectedFeature;
    if (sel && (hiddenIds.has(sel.id) || (Boolean(sel.folder_id) && hiddenFolderIds.has(sel.folder_id!)))) {
      useMapStore.setState({ selectedFeature: null });
    }
  }, [hiddenFeaturesSetting, settings.markerFolders]);

  useMapFeatures({
    featureSource: featSrc,
    featuresVersion,
    markerFolders: settings.markerFolders ?? "[]",
    hiddenFeatures: hiddenFeaturesSetting ?? "[]",
    editingFeatureId,
  });

  useMapMeasurementInteractions({
    mapRef,
    measureSource: measureSrc,
    profileRequest,
    tool,
    measurementType: settings.measurementType ?? "distance",
    editingFeatureId,
    activeUnsavedMeasurementId,
  });

  return (
    <div className="relative h-full w-full">
      <div
        ref={el}
        tabIndex={0}
        data-map-viewport="true"
        aria-label="Karttanäkymä"
        className="absolute inset-0 outline-none"
        style={{ cursor: tool === "measure" ? "crosshair" : "default" }}
      />
      {showCenterCrosshair && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20" style={{ opacity: overlayOpacity }}>
          <div className="relative flex items-center justify-center">
            <div className="absolute h-5 w-[2px]" style={{ backgroundColor: crosshairColor }}></div>
            <div className="absolute w-5 h-[2px]" style={{ backgroundColor: crosshairColor }}></div>
          </div>
        </div>
      )}
      {showLayerErrors && baseLayerError && (
        <div className="absolute left-3 right-3 top-3 z-30 rounded bg-red-700 px-3 py-2 text-xs text-white shadow-lg" style={{ opacity: overlayOpacity }}>
          Karttatason lataus: {baseLayerError}
        </div>
      )}
      {geoError && (
        <div className="absolute bottom-14 right-3 z-30 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-xs text-amber-900 shadow-lg backdrop-blur dark:border-amber-700/60 dark:bg-zinc-900/95 dark:text-amber-300" style={{ opacity: overlayOpacity }}>
          <span>{geoError}</span>
          <button type="button" onClick={() => setGeoError(null)} className="font-semibold underline hover:opacity-80">Sulje</button>
        </div>
      )}

      <div
        ref={bottomRightRef}
        className="map-bottom-right pointer-events-none absolute bottom-3 right-3 z-10 flex flex-col-reverse items-end gap-2"
        style={{ opacity: overlayOpacity }}
      >
        {settings.showGeolocation !== "0" && (
          <button
            type="button"
            className="map-geoloc-btn flex h-7 w-7 items-center justify-center rounded-sm border border-slate-300 bg-white/95 text-slate-700 shadow-md backdrop-blur transition hover:bg-slate-100 hover:text-blue-600 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
            onClick={handleLocateUser}
            title="Oma sijainti (paikanna)"
            aria-label="Paikanna oma sijainti"
          >
            <LocateFixed size={16} className={locating ? "animate-spin text-blue-600" : ""} />
          </button>
        )}
      </div>

      <FeatureContextMenu value={contextMenu} opacity={overlayOpacity} measureSource={measureSrc.current} profileRequest={profileRequest} onClose={() => setContextMenu(null)} />
    </div>
  );
}