import { useEffect, type MutableRefObject, type RefObject } from "react";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import Feature from "ol/Feature";
import VectorSource from "ol/source/Vector";
import OlMap from "ol/Map";
import { fromLonLat, toLonLat } from "ol/proj";
import { getArea, getLength } from "ol/sphere";
import { elevationBatch } from "../../location-info/elevationService";
import { useMapStore } from "../../../store/mapStore";

interface MapMeasurementOptions {
  mapRef: RefObject<OlMap | null>;
  measureSource: MutableRefObject<VectorSource>;
  profileRequest: MutableRefObject<number>;
  tool: string;
  measurementType: string;
  editingFeatureId: number | null;
}

export function useMapMeasurementInteractions({
  mapRef,
  measureSource,
  profileRequest,
  tool,
  measurementType,
  editingFeatureId,
}: MapMeasurementOptions) {
  useEffect(() => {
    const canDraw = tool === "measure";
    const canModify = canDraw || editingFeatureId !== null;
    if (!canDraw && !canModify) return;
    const map = mapRef.current;
    if (!map) return;
    const draw = canDraw
      ? new Draw({ source: measureSource.current, type: measurementType === "area" ? "Polygon" : "LineString" })
      : null;
    const modify = new Modify({ source: measureSource.current });
    const requestId = () => {
      profileRequest.current += 1;
      return profileRequest.current;
    };
    const updateProfile = async (feature: Feature) => {
      const geom = feature.getGeometry();
      if (!(geom instanceof LineString) && !(geom instanceof Polygon)) return;
      const kind = geom instanceof Polygon ? "area" : "distance";
      const length = geom instanceof Polygon ? getArea(geom, { projection: "EPSG:3857" }) : getLength(geom, { projection: "EPSG:3857" });
      const geojson = new GeoJSON().writeGeometry(geom, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
      const id = requestId();
      useMapStore.setState({ measure: { length, geojson, kind }, profile: null, profileVisible: false, profileError: null });
      if (kind === "area" || !(geom instanceof LineString)) return;
      const n = Math.min(100, Math.max(2, Math.ceil(length / 100) + 1));
      const fractions = Array.from({ length: n }, (_, index) => index / (n - 1));
      const points = fractions.map((fraction) => toLonLat(geom.getCoordinateAt(fraction)) as [number, number]);
      try {
        const elevations = await elevationBatch(points);
        if (id !== profileRequest.current) return;
        useMapStore.setState({ profile: fractions.map((fraction, index) => ({ dist: fraction * length, elev: elevations[index] })), profileVisible: false });
      } catch (error) {
        if (id === profileRequest.current) useMapStore.setState({ profileError: String(error) });
      }
    };
    draw?.on("drawend", (event) => void updateProfile(event.feature as Feature));
    modify.on("modifyend", (event) => void updateProfile(event.features.item(0) as Feature));
    if (draw) map.addInteraction(draw);
    map.addInteraction(modify);
    return () => {
      if (draw) map.removeInteraction(draw);
      map.removeInteraction(modify);
    };
  }, [mapRef, measureSource, profileRequest, tool, measurementType, editingFeatureId]);
}
