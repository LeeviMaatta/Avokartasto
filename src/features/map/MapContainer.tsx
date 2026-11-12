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
import ScaleLine from "ol/control/ScaleLine";
import Rotate from "ol/control/Rotate";
import FullScreen from "ol/control/FullScreen";
import OverviewMap from "ol/control/OverviewMap";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import Graticule from "ol/layer/Graticule";
import Stroke from "ol/style/Stroke";
import { Circle as CircleStyle, Fill, Style, Text as TextStyle } from "ol/style";
import DoubleClickZoom from "ol/interaction/DoubleClickZoom";
import DragPan from "ol/interaction/DragPan";
import Kinetic from "ol/Kinetic";
import { LocateFixed } from "lucide-react";
import { requestConfirmation } from "../../app/confirmation";
import { lineStyle, markerStyle, measurementStyle } from "./styles/featureStyles";
import { useMapMeasurementInteractions } from "./hooks/useMapMeasurementInteractions";
import { useMapFeatures } from "./hooks/useMapFeatures";
import { useMapLayers } from "./hooks/useMapLayers";
import FeatureContextMenu from "./components/FeatureContextMenu";
import { recordDebugEvent, setDebugMap } from "../debug/debugMonitor";

export default function MapContainer() {
  const el = useRef<HTMLDivElement>(null);
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
  const measureLayerRef = useRef<VectorLayer<Feature> | null>(null);
  const userLocFeatureRef = useRef<Feature | null>(null);

  const [locating, setLocating] = useState(false);
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null);

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
  const hiddenFeaturesSetting = useMapStore((s) => s.settings.hiddenFeatures);
  
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
    const clearUnsavedMeasurements = () => {
      measureSrc.current.clear();
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
      const detail = (event as CustomEvent<{ id: number; geojson: string }>).detail;
      if (!detail?.geojson) return;
      try {
        const geometry = new GeoJSON().readGeometry(JSON.parse(detail.geojson), {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });
        measureSrc.current.clear();
        const editable = new Feature({ geometry });
        editable.set("id", detail.id);
        measureSrc.current.addFeature(editable);
        if (geometry instanceof LineString) {
          void loadLineProfile(geometry);
        }
      } catch (error) {
        console.error("Muokattavan mittauksen geometriaa ei voitu ladata kartalle", error);
      }
    };
    const handleSearchLocation = (event: Event) => {
      const detail = (event as CustomEvent<{ lat: number; lon: number }>).detail;
      if (!detail || !Number.isFinite(detail.lat) || !Number.isFinite(detail.lon)) return;
      map.getView().animate({ center: fromLonLat([detail.lon, detail.lat]), zoom: Math.max(map.getView().getZoom() ?? 10, 14), duration: 500 });
    };
    mapElement?.addEventListener("contextmenu", preventBrowserContextMenu);
    window.addEventListener("clear-unsaved-measurements", clearUnsavedMeasurements);
    window.addEventListener("open-measurement-editor", handleOpenMeasurementEditor);

    const map = new OlMap({
      target: el.current!,
      view: new View({ center: fromLonLat([24.94, 60.17]), zoom: 10, maxZoom: 21, enableRotation: settings.enableRotation !== "0" }),
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
            return feature.getGeometry()?.getType() === "Point"
              ? markerStyle(String(feature.get("color") || "#dc2626"))
              : lineStyle(String(feature.get("color") || "#dc2626"));
          },
          zIndex: 90,
        }),
        (() => {
          const mLayer = new VectorLayer({
            className: "ol-vector-layer",
            source: measureSrc.current,
            style: measurementStyle("#2563eb", settings.showSegmentLengths !== "0", settings.measurementUnits ?? "metric"),
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
    const initialDblClickZoom = map.getInteractions().getArray().find((i) => i instanceof DoubleClickZoom);
    if (initialDblClickZoom) {
      initialDblClickZoom.setActive(settings.enableDoubleClickZoom === "1");
    }
    window.addEventListener("map-search-location", handleSearchLocation);
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
        const saved = featSrc.current.hasFeature(feature) && feature !== pendingMarkerFeature.current;
        const savedId = saved ? Number(feature.get("id")) : null;
        if (saved && geom instanceof Point) {
          useMapStore.setState({
            selectedFeature: {
              id: savedId!,
              kind: "marker",
              title: String(feature.get("title") || "Merkki"),
              description: feature.get("description") ?? null,
              color: feature.get("color") || "#dc2626",
              folder_id: feature.get("folder_id") ?? null,
              geojson: new GeoJSON().writeGeometry(geom, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }),
            },
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
        useMapStore.setState({
          measure: { length, geojson, kind },
          profile: null,
          profileVisible: false,
          profileError: null,
          tool: "measure",
          selectedFeature: saved && savedId !== null
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

    // Oikea klikkaus mittausviivalla
    const viewport = map.getViewport();
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const pixel = map.getEventPixel(e);
      let clickedFeature: Feature | null = null;
      let savedId: number | undefined;
      map.forEachFeatureAtPixel(pixel, (feat) => {
        const feature = feat as Feature;
        if (measureSrc.current.hasFeature(feature) || featSrc.current.hasFeature(feature)) {
          clickedFeature = feat as Feature;
          if (featSrc.current.hasFeature(feature) && feature !== pendingMarkerFeature.current) savedId = Number(feature.get("id"));
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
      window.removeEventListener("clear-unsaved-measurements", clearUnsavedMeasurements);
      window.removeEventListener("open-measurement-editor", handleOpenMeasurementEditor);
      window.removeEventListener("map-search-location", handleSearchLocation);
      if (viewRestored.current) {
        const view = map.getView();
        const center = view.getCenter();
        const zoom = view.getZoom();
        if (center && zoom !== undefined) {
          void persistSetting("lastMapCenter", JSON.stringify(toLonLat(center)));
          void persistSetting("lastMapZoom", String(zoom));
        }
      }
      map.setTarget(undefined);
      mapRef.current = null;
      setDebugMap(null);
      viewport.removeEventListener("contextmenu", handleContextMenu);
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
      const scaleLine = new ScaleLine({ units: "metric" });
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
    if (showCompass && !rotateControlRef.current) {
      const rotate = new Rotate({
        autoHide: false,
        tipLabel: "Palauta pohjoinen ylös",
      });
      rotateControlRef.current = rotate;
      map.addControl(rotate);
    } else if (!showCompass && rotateControlRef.current) {
      map.removeControl(rotateControlRef.current);
      rotateControlRef.current = null;
    }
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
      const fs = new FullScreen({ tipLabel: "Koko ruutu (F11)" });
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
    const dragPan = map.getInteractions().getArray().find((i) => i instanceof DragPan) as DragPan | undefined;
    const enableKinetic = settings.kineticPanning !== "0";
    if (dragPan) {
      map.removeInteraction(dragPan);
      const newDragPan = new DragPan({
        kinetic: enableKinetic ? new Kinetic(-0.005, 0.05, 100) : undefined,
      });
      map.addInteraction(newDragPan);
    }
  }, [settings.kineticPanning]);

  useEffect(() => {
    if (!measureLayerRef.current) return;
    const showSegments = settings.showSegmentLengths !== "0";
    const units = settings.measurementUnits ?? "metric";
    measureLayerRef.current.setStyle(measurementStyle("#2563eb", showSegments, units));
  }, [settings.showSegmentLengths, settings.measurementUnits]);

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

  const handleLocateUser = () => {
    if (!navigator.geolocation) {
      alert("Selaimesi tai järjestelmäsi ei tue paikannusta.");
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
        console.warn("Paikannus epäonnistui:", err);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

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
    if (pendingMarkerFeature.current) {
      featSrc.current.removeFeature(pendingMarkerFeature.current);
      pendingMarkerFeature.current = null;
    }
    if (!pendingMarker || !mapRef.current) return;
    const feature = new Feature({
      geometry: new Point(fromLonLat(pendingMarker)),
      color: "#dc2626",
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
  });

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="absolute inset-0" style={{ cursor: tool === "measure" ? "crosshair" : "default" }} />
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

      {settings.showGeolocation !== "0" && (
        <div className="absolute right-3 bottom-[13.5rem] z-10" style={{ opacity: overlayOpacity }}>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-sm border border-slate-300 bg-white/95 text-slate-700 shadow-md backdrop-blur transition hover:bg-slate-100 hover:text-blue-600 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
            onClick={handleLocateUser}
            title="Oma sijainti (paikanna)"
            aria-label="Paikanna oma sijainti"
          >
            <LocateFixed size={16} className={locating ? "animate-spin text-blue-600" : ""} />
          </button>
        </div>
      )}

      <FeatureContextMenu value={contextMenu} opacity={overlayOpacity} measureSource={measureSrc.current} profileRequest={profileRequest} onClose={() => setContextMenu(null)} />
    </div>
  );
}