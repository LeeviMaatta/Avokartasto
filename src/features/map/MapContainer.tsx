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
import { elevationBatch } from "../location-info/elevationService";
import Zoom from "ol/control/Zoom";
import { requestConfirmation } from "../../app/confirmation";
import { lineStyle, markerStyle } from "./styles/featureStyles";
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
  const pendingMarkerFeature = useRef<Feature | null>(null);
  const profileRequest = useRef(0);
  const viewRestored = useRef(false);

  const basemap = useMapStore((s) => s.basemap);
  const overlays = useMapStore((s) => s.overlays);
  const overlayOrder = useMapStore((s) => s.overlayOrder);
  const settings = useMapStore((s) => s.settings);
  const sources = useMapStore((s) => s.sources);
  const tool = useMapStore((s) => s.tool);
  const pendingMarker = useMapStore((s) => s.pendingMarker);
  const featuresVersion = useMapStore((s) => s.featuresVersion);
  const hiddenFeaturesSetting = useMapStore((s) => s.settings.hiddenFeatures);
  
  const showCenterCrosshair = settings.showCenterCrosshair !== "0";
  const crosshairColor = settings.crosshairColor || "#dc2626";
  const rawOverlayOpacity = Number(settings.uiOverlayOpacity ?? "1");
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;

  const [contextMenu, setContextMenu] = useState<{ feature: Feature; x: number; y: number; savedId?: number } | null>(null);
  const { baseLayerError } = useMapLayers({ mapRef, overlayRefs, basemap, overlays, overlayOrder, settings, sources });

  useEffect(() => {
    const mapElement = el.current;
    const preventBrowserContextMenu = (event: MouseEvent) => event.preventDefault();
    const clearUnsavedMeasurements = () => {
      measureSrc.current.clear();
      profileRequest.current += 1;
    };
    const handleSearchLocation = (event: Event) => {
      const detail = (event as CustomEvent<{ lat: number; lon: number }>).detail;
      if (!detail || !Number.isFinite(detail.lat) || !Number.isFinite(detail.lon)) return;
      map.getView().animate({ center: fromLonLat([detail.lon, detail.lat]), zoom: Math.max(map.getView().getZoom() ?? 10, 14), duration: 500 });
    };
    mapElement?.addEventListener("contextmenu", preventBrowserContextMenu);
    window.addEventListener("clear-unsaved-measurements", clearUnsavedMeasurements);

    const map = new OlMap({
      target: el.current!,
      view: new View({ center: fromLonLat([24.94, 60.17]), zoom: 10, maxZoom: 21 }),
      layers: [
        new VectorLayer({
          source: featSrc.current,
          style: (feature) => feature.getGeometry()?.getType() === "Point"
            ? markerStyle(String(feature.get("color") || "#dc2626"))
            : lineStyle(String(feature.get("color") || "#dc2626")),
          zIndex: 90,
        }),
        new VectorLayer({ source: measureSrc.current, style: lineStyle("#2563eb"), zIndex: 100 }),
      ],
    });
    window.addEventListener("map-search-location", handleSearchLocation);
    const updateCoords = () => {
      const centerCoord = toLonLat(map.getView().getCenter()!);
      useMapStore.setState({ centerCoord: centerCoord as [number, number] });
    };

    map.on("pointermove", (e) => {
      const [lon, lat] = toLonLat(e.coordinate);
      useMapStore.setState({ cursor: [lon, lat] });
      updateCoords();
    });
    map.on("moveend", updateCoords);
    map.on("moveend", () => {
      if (!viewRestored.current) return;
      const view = map.getView();
      const center = view.getCenter();
      const zoom = view.getZoom();
      if (!center || zoom === undefined) return;
      void useMapStore.getState().setSetting("lastMapCenter", JSON.stringify(toLonLat(center)));
      void useMapStore.getState().setSetting("lastMapZoom", String(zoom));
    });

    map.on("singleclick", async (e) => {
      // Klikkaus olemassa olevaan mittausviivaan -> laske profiili
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
        if (!(geom instanceof LineString)) return;
        const length = getLength(geom, { projection: "EPSG:3857" });
        const geojson = new GeoJSON().writeGeometry(geom, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
        useMapStore.setState({
          measure: { length, geojson, kind: "distance" },
          profile: null,
          profileVisible: false,
          profileError: null,
          tool: "measure",
          selectedFeature: saved && savedId !== null
            ? { id: savedId, kind: "measurement", title: String(feature.get("title") || "Mittaus") }
            : null,
        });

        const n = Math.min(100, Math.max(2, Math.ceil(length / 100) + 1));
        const fractions = Array.from({ length: n }, (_, i) => i / (n - 1));
        const pts = fractions.map((f) => toLonLat(geom.getCoordinateAt(f)) as [number, number]);
        try {
          const elev = await elevationBatch(pts);
          useMapStore.setState({ profile: fractions.map((f, i) => ({ dist: f * length, elev: elev[i] })), profileVisible: false });
        } catch (err) {
          useMapStore.setState({ profileError: String(err) });
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
      mapElement?.removeEventListener("contextmenu", preventBrowserContextMenu);
      window.removeEventListener("clear-unsaved-measurements", clearUnsavedMeasurements);
      window.removeEventListener("map-search-location", handleSearchLocation);
      if (viewRestored.current) {
        const view = map.getView();
        const center = view.getCenter();
        const zoom = view.getZoom();
        if (center && zoom !== undefined) {
          void useMapStore.getState().setSetting("lastMapCenter", JSON.stringify(toLonLat(center)));
          void useMapStore.getState().setSetting("lastMapZoom", String(zoom));
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
    if (!map || viewRestored.current || Object.keys(settings).length === 0) return;
    const center = (() => {
      try {
        const value = JSON.parse(settings.lastMapCenter ?? "");
        return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number" && Number.isFinite(item))
          ? fromLonLat(value as [number, number])
          : null;
      } catch {
        return null;
      }
    })();
    const zoom = Number(settings.lastMapZoom);
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

  useMapFeatures({
    featureSource: featSrc,
    featuresVersion,
    markerFolders: settings.markerFolders ?? "[]",
    hiddenFeatures: hiddenFeaturesSetting ?? "[]",
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
      {baseLayerError && (
        <div className="absolute left-3 right-3 top-3 z-30 rounded bg-red-700 px-3 py-2 text-xs text-white shadow-lg" style={{ opacity: overlayOpacity }}>
          Karttatason lataus: {baseLayerError}
        </div>
      )}

      <FeatureContextMenu value={contextMenu} opacity={overlayOpacity} measureSource={measureSrc.current} profileRequest={profileRequest} onClose={() => setContextMenu(null)} />
    </div>
  );
}