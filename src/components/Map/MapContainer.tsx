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
import Feature from "ol/Feature";
import { fromLonLat, toLonLat } from "ol/proj";
import { getLength } from "ol/sphere";
import { Stroke, Style, Circle as CircleStyle, Fill } from "ol/style";
import "ol/ol.css";
import { useMapStore } from "../../store/mapStore";
import { buildLayer } from "./layers";
import { elevationBatch } from "../../services/elevationService";
import { listFeatures } from "../../services/tauriBridge";
import { Trash2 } from "lucide-react";

const lineStyle = (color: string) =>
  new Style({
    stroke: new Stroke({ color, width: 3 }),
    image: new CircleStyle({ radius: 5, fill: new Fill({ color }), stroke: new Stroke({ color: "#fff", width: 2 }) }),
  });

export default function MapContainer() {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OlMap | null>(null);
  const baseRef = useRef<TileLayer<any> | null>(null);
  const overlayRefs = useRef<TileLayer<any>[]>([]);
  const measureSrc = useRef(new VectorSource());
  const featSrc = useRef(new VectorSource());

  const basemap = useMapStore((s) => s.basemap);
  const overlays = useMapStore((s) => s.overlays);
  const settings = useMapStore((s) => s.settings);
  const sources = useMapStore((s) => s.sources);
  const tool = useMapStore((s) => s.tool);
  const featuresVersion = useMapStore((s) => s.featuresVersion);
  
  const showCenterCrosshair = settings.showCenterCrosshair !== "0";
  const crosshairColor = settings.crosshairColor || "#dc2626";

  const [contextMenu, setContextMenu] = useState<{ feature: Feature; x: number; y: number } | null>(null);
  const [baseLayerError, setBaseLayerError] = useState<string | null>(null);

  useEffect(() => {
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

    map.on("singleclick", async (e) => {
      if (useMapStore.getState().tool === "streetview") {
        const [lng, lat] = toLonLat(e.coordinate);
        useMapStore.setState({ streetViewPos: { lat, lng } });
        return;
      }

      // Klikkaus olemassa olevaan mittausviivaan -> laske profiili
      let clickedFeature: Feature | null = null;
      map.forEachFeatureAtPixel(e.pixel, (feat) => {
        if (measureSrc.current.hasFeature(feat as Feature)) {
          clickedFeature = feat as Feature;
          return true;
        }
      });

      if (clickedFeature) {
        const geom = clickedFeature.getGeometry() as LineString;
        const length = getLength(geom, { projection: "EPSG:3857" });
        const geojson = new GeoJSON().writeGeometry(geom, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
        useMapStore.setState({ measure: { length, geojson } });

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
    map.on("contextmenu", (e) => {
      e.preventDefault();
      let clickedFeature: Feature | null = null;
      map.forEachFeatureAtPixel(e.pixel, (feat) => {
        if (measureSrc.current.hasFeature(feat as Feature)) {
          clickedFeature = feat as Feature;
          return true;
        }
      });
      if (clickedFeature) {
        setContextMenu({ feature: clickedFeature, x: e.pixel[0], y: e.pixel[1] });
      } else {
        setContextMenu(null);
      }
    });

    // Lisätään Modify-interaktio mittausten muokkaukseen
    const modify = new Modify({ source: measureSrc.current });
    modify.on("modifyend", async (ev) => {
      const feat = ev.features.item(0) as Feature;
      if (feat) {
        const geom = feat.getGeometry() as LineString;
        const length = getLength(geom, { projection: "EPSG:3857" });
        const geojson = new GeoJSON().writeGeometry(geom, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
        useMapStore.setState({ measure: { length, geojson } });

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
    map.addInteraction(modify);

    mapRef.current = map;
    updateCoords();
    return () => map.setTarget(undefined);
  }, []);

  useEffect(() => {
    const map = mapRef.current!;
    setBaseLayerError(null);
    const l = buildLayer(basemap, settings, sources, false);
    const previous = baseRef.current;
    if (!l) {
      setBaseLayerError("Karttatason asetukset puuttuvat tai tasoa ei voitu luoda.");
      return;
    }

    const source = l.getSource();
    if (!source) return;

    let settled = false;
    const finish = (success: boolean, message?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      source.un("tileloadend", onLoad);
      source.un("tileloaderror", onError);

      if (success) {
        if (previous) map.removeLayer(previous);
        l.setZIndex(0);
        baseRef.current = l;
      } else {
        map.removeLayer(l);
        setBaseLayerError(message ?? "Karttatiilien lataus epäonnistui.");
      }
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false, "Karttatiilien lataus epäonnistui. Tarkista tunnukset.");
    const timeout = window.setTimeout(
      () => finish(false, "Karttatiilien lataus aikakatkaistiin. Aiempi karttataso säilytettiin."),
      10_000
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
  }, [basemap, settings.mmlKey, settings.lantmaterietUsername, settings.lantmaterietPassword, sources, featuresVersion]);

  useEffect(() => {
    const map = mapRef.current!;
    overlayRefs.current.forEach((l) => map.removeLayer(l));
    overlayRefs.current = [];
    overlays.forEach((id, i) => {
      const l = buildLayer(id, settings, sources, true);
      if (l) {
        l.setZIndex(10 + i);
        map.addLayer(l);
        overlayRefs.current.push(l);
      }
    });
  }, [overlays, settings.mmlKey, settings.owmKey, sources, featuresVersion]);

  useEffect(() => {
    listFeatures().then((rows) => {
      featSrc.current.clear();
      const fmt = new GeoJSON();
      rows.forEach((r) =>
        featSrc.current.addFeatures(
          fmt.readFeatures(
            { type: "Feature", geometry: JSON.parse(r.geojson), properties: { id: r.id, title: r.title } },
            { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }
          )
        )
      );
    });
  }, [featuresVersion]);

  useEffect(() => {
    if (tool !== "measure") {
      setContextMenu(null);
      return;
    }
    const map = mapRef.current!;
    const draw = new Draw({ source: measureSrc.current, type: "LineString" });
    
    draw.on("drawend", async (ev) => {
      const geom = ev.feature.getGeometry() as LineString;
      const length = getLength(geom, { projection: "EPSG:3857" });
      const geojson = new GeoJSON().writeGeometry(geom, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
      useMapStore.setState({ measure: { length, geojson } });

      const n = Math.min(100, Math.max(2, Math.ceil(length / 100) + 1));
      const fractions = Array.from({ length: n }, (_, i) => i / (n - 1));
      const pts = fractions.map((f) => toLonLat(geom.getCoordinateAt(f)) as [number, number]);
      try {
        const elev = await elevationBatch(pts);
        useMapStore.setState({ profile: fractions.map((f, i) => ({ dist: f * length, elev: elev[i] })) });
      } catch (err) {
        useMapStore.setState({ profileError: String(err) });
      }
    });
    map.addInteraction(draw);
    return () => {
      map.removeInteraction(draw);
    };
  }, [tool]);

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
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-left text-red-600 dark:text-red-400"
            onClick={() => {
              measureSrc.current.removeFeature(contextMenu.feature);
              useMapStore.setState({ measure: null, profile: null });
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