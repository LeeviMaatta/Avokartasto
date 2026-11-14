import { useEffect, useRef } from "react";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import VectorSource from "ol/source/Vector";
import { getArea, getLength } from "ol/sphere";
import { Trash2, Pencil } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { deleteFeature } from "../../../infrastructure/tauri";
import { requestConfirmation } from "../../../app/confirmation";
import {
  clearSavedEditFeatures,
  ensureUnsavedMeasurementId,
} from "../../measurements/domain/measurementSource";
import { focusFirstNavigable, focusMapViewport, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";

type ContextMenuState = { feature: Feature; x: number; y: number; savedId?: number };

interface FeatureContextMenuProps {
  value: ContextMenuState | null;
  opacity: number;
  measureSource: VectorSource;
  profileRequest: { current: number };
  onClose: () => void;
}

export default function FeatureContextMenu({ value, opacity, measureSource, profileRequest, onClose }: FeatureContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value) return;
    window.requestAnimationFrame(() => focusFirstNavigable(menuRef.current));
  }, [value]);

  if (!value) return null;
  const geometry = value.feature.getGeometry();
  const isPoint = geometry instanceof Point;
  const title = String(value.feature.get("title") || (isPoint ? "Merkki" : "Mittaus"));
  const geojson = geometry
    ? new GeoJSON().writeGeometry(geometry, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" })
    : "";
  const canDelete = Boolean(geometry && (value.savedId || !isPoint));

  const handleDelete = async () => {
    if (!canDelete) return;
    const prompt = isPoint
      ? `Haluatko varmasti poistaa merkin "${title}"?`
      : `Haluatko varmasti poistaa mittauksen "${title}"?`;
    if (!(await requestConfirmation(prompt))) return;
    if (value.savedId) {
      await deleteFeature(value.savedId);
      useMapStore.getState().bumpFeatures();
      if (!isPoint) clearSavedEditFeatures(measureSource, value.savedId);
    } else {
      measureSource.removeFeature(value.feature);
    }
    const state = useMapStore.getState();
    const deletedActiveSaved = value.savedId !== undefined && state.editingFeatureId === value.savedId;
    const deletedActiveUnsaved =
      value.savedId === undefined &&
      Boolean(value.feature.get("unsavedId")) &&
      state.activeUnsavedMeasurementId === value.feature.get("unsavedId");
    if (deletedActiveSaved || deletedActiveUnsaved) {
      profileRequest.current += 1;
      useMapStore.setState({
        measure: null,
        profile: null,
        profileVisible: false,
        profileError: null,
        editingFeatureId: null,
        activeUnsavedMeasurementId: null,
        selectedFeature: null,
      });
    }
    onClose();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      onKeyDown={(event) => {
        if (event.key === "Delete" && !event.ctrlKey && !event.altKey && !event.metaKey && canDelete) {
          event.preventDefault();
          event.stopPropagation();
          void handleDelete();
          return;
        }
        handleContainerArrowKeyDown(event, { onEscape: () => { onClose(); focusMapViewport(); } });
      }}
      style={{ top: value.y, left: value.x, opacity }}
      data-feature-context-menu
      className="absolute z-40 rounded-lg border border-gray-700 bg-white py-1 text-xs shadow-xl dark:bg-gray-800 dark:text-white"
    >
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[#1671a8] hover:bg-gray-100 dark:hover:bg-gray-700"
        onClick={() => {
          if (!geometry) return;
          if (isPoint) {
            if (value.savedId) {
              window.dispatchEvent(new CustomEvent("open-marker-editor", {
                detail: {
                  id: value.savedId,
                  title,
                  description: value.feature.get("description") ?? null,
                  feature_type: "POINT",
                  geojson,
                  folder_id: value.feature.get("folder_id") ?? "",
                  color: value.feature.get("color") || "#dc2626",
                  created_at: "",
                },
              }));
            }
            onClose();
            return;
          }
          const kind = geometry instanceof Polygon ? "area" : "distance";
          const length = kind === "area" ? getArea(geometry, { projection: "EPSG:3857" }) : geometry instanceof LineString ? getLength(geometry, { projection: "EPSG:3857" }) : 0;
          if (value.savedId) {
            clearSavedEditFeatures(measureSource);
            const editable = value.feature.clone();
            editable.set("id", value.savedId);
            measureSource.addFeature(editable);
            useMapStore.setState({
              pendingMarker: null,
              markerEditorOpen: false,
              editingFeatureId: value.savedId,
              activeUnsavedMeasurementId: null,
              measure: { length, geojson, kind },
              profile: null,
              profileVisible: false,
              profileError: null,
              selectedFeature: {
                id: value.savedId,
                kind: "measurement",
                title,
                description: value.feature.get("description") ?? null,
                color: value.feature.get("color") || "#dc2626",
                folder_id: value.feature.get("folder_id") ?? null,
                geojson,
              },
            });
          } else {
            clearSavedEditFeatures(measureSource);
            const uid = ensureUnsavedMeasurementId(value.feature);
            useMapStore.setState({
              pendingMarker: null,
              markerEditorOpen: false,
              editingFeatureId: null,
              activeUnsavedMeasurementId: uid,
              measure: { length, geojson, kind },
              profile: null,
              profileVisible: false,
              profileError: null,
              selectedFeature: null,
            });
          }
          onClose();
        }}
      >
        <Pencil size={13} /> {isPoint ? "Muokkaa merkkiä" : "Muokkaa mittausta"}
      </button>
      {canDelete && (
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-600 hover:bg-gray-100 dark:text-red-400 dark:hover:bg-gray-700"
          onClick={() => void handleDelete()}
        >
          <Trash2 size={13} /> {isPoint ? "Poista merkki" : "Poista mittaus"}
        </button>
      )}
    </div>
  );
}
