import { useEffect, type MutableRefObject, type RefObject } from "react";
import Collection from "ol/Collection";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import Feature from "ol/Feature";
import VectorSource from "ol/source/Vector";
import OlMap from "ol/Map";
import { toLonLat } from "ol/proj";
import { getArea, getLength } from "ol/sphere";
import { elevationBatch } from "../../location-info/elevationService";
import {
  ensureUnsavedMeasurementId,
  findTargetMeasurementFeature,
} from "../../measurements/domain/measurementSource";
import { useMapStore } from "../../../store/mapStore";

interface MapMeasurementOptions {
  mapRef: RefObject<OlMap | null>;
  measureSource: MutableRefObject<VectorSource>;
  profileRequest: MutableRefObject<number>;
  tool: string;
  measurementType: string;
  editingFeatureId: number | null;
  activeUnsavedMeasurementId: string | null;
}

export function useMapMeasurementInteractions({
  mapRef,
  measureSource,
  profileRequest,
  tool,
  measurementType,
  editingFeatureId,
  activeUnsavedMeasurementId,
}: MapMeasurementOptions) {
  useEffect(() => {
    const canDraw = tool === "measure";
    const canModify = canDraw || editingFeatureId !== null || activeUnsavedMeasurementId !== null;
    if (!canDraw && !canModify) return;
    const map = mapRef.current;
    if (!map) return;
    const draw = canDraw
      ? new Draw({ source: measureSource.current, type: measurementType === "area" ? "Polygon" : "LineString" })
      : null;
    const editableCollection = new Collection<Feature>();
    const syncEditableCollection = () => {
      const target = findTargetMeasurementFeature(
        measureSource.current,
        editingFeatureId,
        activeUnsavedMeasurementId,
      );
      if (editableCollection.getLength() === 1 && editableCollection.item(0) === target) {
        return;
      }
      editableCollection.clear();
      if (target) editableCollection.push(target);
    };
    syncEditableCollection();
    const modify = new Modify({ features: editableCollection });
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
      const savedId = feature.get("id");
      const isSaved = savedId !== undefined && savedId !== null;
      const nextUnsavedId = isSaved ? null : ensureUnsavedMeasurementId(feature);
      useMapStore.setState({
        measure: { length, geojson, kind },
        profile: null,
        profileVisible: false,
        profileError: null,
        ...(isSaved
          ? { editingFeatureId: Number(savedId), activeUnsavedMeasurementId: null }
          : { editingFeatureId: null, activeUnsavedMeasurementId: nextUnsavedId, selectedFeature: null }),
      });
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
    draw?.on("drawend", (event) => {
      const feature = event.feature as Feature;
      ensureUnsavedMeasurementId(feature);
      void updateProfile(feature);
    });
    modify.on("modifyend", (event) => {
      const feature = event.features.item(0) as Feature | undefined;
      if (feature) void updateProfile(feature);
    });
    measureSource.current.on("addfeature", syncEditableCollection);
    measureSource.current.on("removefeature", syncEditableCollection);
    if (draw) map.addInteraction(draw);
    map.addInteraction(modify);
    return () => {
      measureSource.current.un("addfeature", syncEditableCollection);
      measureSource.current.un("removefeature", syncEditableCollection);
      editableCollection.clear();
      if (draw) map.removeInteraction(draw);
      map.removeInteraction(modify);
    };
  }, [mapRef, measureSource, profileRequest, tool, measurementType, editingFeatureId, activeUnsavedMeasurementId]);
}
