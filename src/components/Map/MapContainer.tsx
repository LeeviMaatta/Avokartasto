import { useEffect, useRef, useState } from "react";
import OlMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import Feature from "ol/Feature";
import { fromLonLat, toLonLat } from "ol/proj";
import { getArea, getLength } from "ol/sphere";
import { Stroke, Style, Circle as CircleStyle, Fill } from "ol/style";
import "ol/ol.css";
import { useMapStore } from "../../store/mapStore";
import { buildLayer } from "./layers";
import { elevationBatch } from "../../services/elevationService";
import { deleteFeature, listFeatures } from "../../services/tauriBridge";
import { Trash2 } from "lucide-react";

const lineStyle = (color: string) =>
  new Style({
    stroke: new Stroke({ color, width: 3 }),
    fill: new Fill({ color: `${color}33` }),
    image: new CircleStyle({ radius: 5, fill: new Fill({ color }), stroke: new Stroke({ color: "#fff", width: 2 }) }),
  });

const APP_LAYER_TYPE = "karttasovellus-layer-type";

export default function MapContainer() {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OlMap | null>(null);
  const overlayRefs = useRef<TileLayer<any>[]>([]);
  const measureSrc = useRef(new VectorSource());
  const featSrc = useRef(new VectorSource());
  const profileRequest = useRef(0);
  const viewRestored = useRef(false);
  const saveViewTimer = useRef<number | null>(null);

  const basemap = useMapStore((s) => s.basemap);
  const overlays = useMapStore((s) => s.overlays);
  const overlayOrder = useMapStore((s) => s.overlayOrder);
  const settings = useMapStore((s) => s.settings);
  const sources = useMapStore((s) => s.sources);
  const tool = useMapStore((s) => s.tool);
  const featuresVersion = useMapStore((s) => s.featuresVersion);
  
  const showCenterCrosshair = settings.showCenterCrosshair !== "0";
  const crosshairColor = settings.crosshairColor || "#dc2626";

  const [contextMenu, setContextMenu] = useState<{ feature: Feature; x: number; y: number; savedId?: number } | null>(null);
  const [baseLayerError, setBaseLayerError] = useState<string | null>(null);

  useEffect(() => {
    const mapElement = el.current;
    const preventBrowserContextMenu = (event: MouseEvent) => event.preventDefault();
    const clearUnsavedMeasurements = () => {
      measureSrc.current.clear();
      profileRequest.current += 1;
    };
    mapElement?.addEventListener("contextmenu", preventBrowserContextMenu);
    window.addEventListener("clear-unsaved-measurements", clearUnsavedMeasurements);

    const map = new OlMap({
      target: el.current!,
      view: new View({ center: fromLonLat([24.94, 60.17]), zoom: 10, maxZoom: 21 }),
      layers: [
        new VectorLayer({ source: featSrc.current, style: lineStyle("#dc2626"), zIndex: 90 }),
        new VectorLayer({ source: measureSrc.current, style: lineStyle("#2563eb"), zIndex: 100 }),
      ],
    });
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
      if (saveViewTimer.current !== null) window.clearTimeout(saveViewTimer.current);
      saveViewTimer.current = window.setTimeout(() => {
        const view = map.getView();
        const center = view.getCenter();
        const zoom = view.getZoom();
        if (!center || zoom === undefined) return;
        void useMapStore.getState().setSetting("lastMapCenter", JSON.stringify(toLonLat(center)));
        void useMapStore.getState().setSetting("lastMapZoom", String(zoom));
      }, 400);
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
        if (!(geom instanceof LineString)) return;
        const length = getLength(geom, { projection: "EPSG:3857" });
        const geojson = new GeoJSON().writeGeometry(geom, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
        useMapStore.setState({ measure: { length, geojson, kind: "distance" } });

        const n = Math.min(100, Math.max(2, Math.ceil(length / 100) + 1));
        const fractions = Array.from({ length: n }, (_, i) => i / (n - 1));
        const pts = fractions.map((f) => toLonLat(geom.getCoordinateAt(f)) as [number, number]);
        try {
          const elev = await elevationBatch(pts);
          useMapStore.setState({ profile: fractions.map((f, i) => ({ dist: f * length, elev: elev[i] })) });
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
          if (featSrc.current.hasFeature(feature)) savedId = Number(feature.get("id"));
          return true;
        }
      }, { hitTolerance: 12 });
      const selectedFeature = clickedFeature;
      if (selectedFeature) {
        setContextMenu({ feature: selectedFeature, x: pixel[0], y: pixel[1], savedId });
      } else {
        setContextMenu(null);
      }
    };
    viewport.addEventListener("contextmenu", handleContextMenu);

    mapRef.current = map;
    updateCoords();
    return () => {
      mapElement?.removeEventListener("contextmenu", preventBrowserContextMenu);
      window.removeEventListener("clear-unsaved-measurements", clearUnsavedMeasurements);
      if (saveViewTimer.current !== null) window.clearTimeout(saveViewTimer.current);
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
      viewport.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

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
    const map = mapRef.current!;
    setBaseLayerError(null);
    const l = buildLayer(basemap, settings, sources, false);
    const previousBaseLayers = map.getLayers().getArray().filter(
      (layer) => layer instanceof TileLayer && layer.get(APP_LAYER_TYPE) === "basemap",
    ) as TileLayer<any>[];
    if (!l) {
      setBaseLayerError("Karttatason asetukset puuttuvat tai tasoa ei voitu luoda.");
      return;
    }
    l.set(APP_LAYER_TYPE, "basemap");

    const source = l.getSource();
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
        previousBaseLayers.forEach((previous) => map.removeLayer(previous));
        l.setZIndex(0);
      } else {
        map.removeLayer(l);
        setBaseLayerError(message ?? "Karttatiilien lataus epäonnistui.");
      }
    };
    const onLoad = () => {
      loadedTiles += 1;
      finish(true);
    };
    const onError = () => {
      failedTiles += 1;
      if (failedTiles >= 5 && loadedTiles === 0) {
        finish(false, "Karttatiilien lataus epäonnistui. Tarkista tunnukset.");
      }
    };
    const timeout = window.setTimeout(
      () => finish(
        loadedTiles > 0,
        loadedTiles > 0
          ? undefined
          : "Karttatiilien lataus aikakatkaistiin. Aiempi karttataso säilytettiin."
      ),
      15_000
    );

    source.on("tileloadend", onLoad);
    source.on("tileloaderror", onError);
    l.setZIndex(1);
    map.addLayer(l);

    return () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timeout);
        source.un("tileloadend", onLoad);
        source.un("tileloaderror", onError);
        map.removeLayer(l);
      }
    };
  }, [basemap, settings.mmlKey, settings.lantmaterietUsername, settings.lantmaterietPassword, settings.layerCopies, settings.layerViewSettings, sources]);

  useEffect(() => {
    const map = mapRef.current!;
    map.getLayers().getArray()
      .filter((layer) => layer instanceof TileLayer && layer.get(APP_LAYER_TYPE) === "overlay")
      .forEach((layer) => map.removeLayer(layer));
    overlayRefs.current = [];
    [...overlays].sort((a, b) => {
      const ai = overlayOrder.indexOf(a);
      const bi = overlayOrder.indexOf(b);
      return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
    }).forEach((id, i) => {
      const l = buildLayer(id, settings, sources, true);
      if (l) {
        l.set(APP_LAYER_TYPE, "overlay");
        l.setZIndex(10 + i);
        map.addLayer(l);
        overlayRefs.current.push(l);
      }
    });
  }, [overlays, overlayOrder, settings.mmlKey, settings.owmKey, settings.layerCopies, settings.layerViewSettings, sources]);

  useEffect(() => {
    listFeatures().then((rows) => {
      featSrc.current.clear();
      const fmt = new GeoJSON();
      rows.forEach((r) => {
        try {
          featSrc.current.addFeatures(
            fmt.readFeatures(
              { type: "Feature", geometry: JSON.parse(r.geojson), properties: { id: r.id, title: r.title } },
              { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }
            )
          );
        } catch (error) {
          console.error(`Tallennetun merkinnän ${r.id} geometria ei kelpaa`, error);
        }
      });
    });
  }, [featuresVersion]);

  useEffect(() => {
    if (tool !== "measure") {
      setContextMenu(null);
      return;
    }
    const map = mapRef.current!;
    if (!map) return;
    const measurementType = settings.measurementType ?? "distance";
    const draw = new Draw({ source: measureSrc.current, type: measurementType === "area" ? "Polygon" : "LineString" });
    const modify = new Modify({ source: measureSrc.current });
    const requestId = () => {
      profileRequest.current += 1;
      return profileRequest.current;
    };
    const updateProfile = async (feature: Feature) => {
      const geom = feature.getGeometry();
      if (!(geom instanceof LineString) && !(geom instanceof Polygon)) return;
      const kind = geom instanceof Polygon ? "area" : "distance";
      const length = geom instanceof Polygon
        ? getArea(geom, { projection: "EPSG:3857" })
        : getLength(geom, { projection: "EPSG:3857" });
      const geojson = new GeoJSON().writeGeometry(geom, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
      const id = requestId();
      useMapStore.setState({ measure: { length, geojson, kind }, profile: null, profileError: null });
      if (kind === "area") return;
      if (!(geom instanceof LineString)) return;
      const n = Math.min(100, Math.max(2, Math.ceil(length / 100) + 1));
      const fractions = Array.from({ length: n }, (_, i) => i / (n - 1));
      const pts = fractions.map((f) => toLonLat(geom.getCoordinateAt(f)) as [number, number]);
      try {
        const elev = await elevationBatch(pts);
        if (id !== profileRequest.current) return;
        useMapStore.setState({ profile: fractions.map((f, i) => ({ dist: f * length, elev: elev[i] })) });
      } catch (err) {
        if (id === profileRequest.current) useMapStore.setState({ profileError: String(err) });
      }
    };
    
    draw.on("drawend", (ev) => void updateProfile(ev.feature as Feature));
    modify.on("modifyend", (ev) => void updateProfile(ev.features.item(0) as Feature));
    map.addInteraction(draw);
    map.addInteraction(modify);
    return () => {
      map.removeInteraction(draw);
      map.removeInteraction(modify);
    };
  }, [tool, settings.measurementType]);

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="absolute inset-0" style={{ cursor: tool === "none" ? "grab" : "crosshair" }} />
      {showCenterCrosshair && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20">
          <div className="relative flex items-center justify-center">
            <div className="absolute h-5 w-[2px]" style={{ backgroundColor: crosshairColor }}></div>
            <div className="absolute w-5 h-[2px]" style={{ backgroundColor: crosshairColor }}></div>
          </div>
        </div>
      )}
      {baseLayerError && basemap === "lantmateriet-topo" && (
        <div className="absolute left-3 right-3 top-3 z-30 rounded bg-red-700 px-3 py-2 text-xs text-white shadow-lg">
          Lantmäteriet Topo: {baseLayerError}
        </div>
      )}

      {contextMenu && (
        <div 
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="absolute z-40 rounded-lg bg-white dark:bg-gray-800 dark:text-white shadow-xl border dark:border-gray-700 py-1 text-xs"
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[#1671a8] hover:bg-gray-100"
            onClick={() => {
              const geometry = contextMenu.feature.getGeometry();
              if (!geometry) return;
              if (contextMenu.savedId) {
                measureSrc.current.clear();
                const editable = contextMenu.feature.clone();
                editable.set("id", contextMenu.savedId);
                measureSrc.current.addFeature(editable);
                const kind = geometry instanceof Polygon ? "area" : "distance";
                const value = kind === "area"
                  ? getArea(geometry, { projection: "EPSG:3857" })
                  : geometry instanceof LineString
                    ? getLength(geometry, { projection: "EPSG:3857" })
                    : 0;
                const geojson = new GeoJSON().writeGeometry(geometry, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
                useMapStore.setState({
                  tool: "measure",
                  editingFeatureId: contextMenu.savedId,
                  measure: { length: value, geojson, kind },
                  profile: null,
                  profileError: null,
                });
              } else {
                useMapStore.setState({ tool: "measure" });
              }
              setContextMenu(null);
            }}
          >
            Muokkaa mittausta
          </button>
          <button 
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-left text-red-600 dark:text-red-400"
            onClick={() => {
              if (contextMenu.savedId) {
                void deleteFeature(contextMenu.savedId).then(() => useMapStore.getState().bumpFeatures());
              } else {
                measureSrc.current.removeFeature(contextMenu.feature);
              }
              profileRequest.current += 1;
              profileRequest.current += 1;
              useMapStore.setState({ measure: null, profile: null, profileError: null });
              setContextMenu(null);
            }}
          >
            <Trash2 size={13} /> Poista mittaus
          </button>
        </div>
      )}
    </div>
  );
}