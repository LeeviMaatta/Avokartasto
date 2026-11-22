import { useEffect, useRef } from "react";
import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import VectorSource from "ol/source/Vector";
import { getArea, getLength } from "ol/sphere";
import { Trash2, Pencil, Link2 } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { deleteFeature } from "../../../infrastructure/tauri";
import { requestConfirmation } from "../../../app/confirmation";
import {
  getLinkedMeasurementGroup,
  isSameMeasurementItem,
  toMeasurementLinkKey,
} from "../../measurements/domain/measurementSelection";
import {
  clearSavedEditFeatures,
  ensureUnsavedMeasurementId,
  getUnsavedMeasurementFeatures,
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
    let removedUnsavedIndex: number | undefined;
    if (value.savedId) {
      await deleteFeature(value.savedId);
      useMapStore.getState().bumpFeatures();
      if (!isPoint) clearSavedEditFeatures(measureSource, value.savedId);
    } else {
      const idx = getUnsavedMeasurementFeatures(measureSource).indexOf(value.feature);
      if (idx >= 0) removedUnsavedIndex = idx;
      measureSource.removeFeature(value.feature);
    }
    const state = useMapStore.getState();
    const unsavedId =
      value.savedId === undefined && typeof value.feature.get("unsavedId") === "string"
        ? String(value.feature.get("unsavedId"))
        : null;
    if (unsavedId) state.unlinkMeasurement(unsavedId);
    const deletedRef = { savedId: value.savedId ?? null, unsavedId };
    const remainingSelection = state.selectedMeasurements.filter(
      (item) => !isSameMeasurementItem(item, deletedRef),
    );
    const deletedWasSelected = remainingSelection.length !== state.selectedMeasurements.length;
    const deletedActiveSaved = value.savedId !== undefined && state.editingFeatureId === value.savedId;
    const deletedActiveUnsaved =
      unsavedId !== null && state.activeUnsavedMeasurementId === unsavedId;
    if (deletedWasSelected || deletedActiveSaved || deletedActiveUnsaved) {
      profileRequest.current += 1;
      if (remainingSelection.length === 0) {
        state.clearMeasurementSelection();
        if (value.savedId === undefined && state.tool === "measure") {
          window.dispatchEvent(
            new CustomEvent("focus-next-unsaved-measurement", {
              detail: { preferredIndex: removedUnsavedIndex },
            }),
          );
        }
      } else if (remainingSelection.length === 1) {
        window.dispatchEvent(
          new CustomEvent("focus-single-measurement", { detail: { item: remainingSelection[0] } }),
        );
      } else {
        const nextPrimary = remainingSelection[remainingSelection.length - 1];
        useMapStore.setState({
          selectedMeasurements: remainingSelection,
          editingFeatureId: nextPrimary.savedId,
          activeUnsavedMeasurementId: nextPrimary.savedId !== null ? null : nextPrimary.unsavedId,
        });
      }
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
              selectedMeasurements: [
                { savedId: value.savedId, unsavedId: null, length, kind, title },
              ],
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
              selectedMeasurements: [{ savedId: null, unsavedId: uid, length, kind }],
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
      {(() => {
        if (isPoint) return null;
        const contextLinkKey = toMeasurementLinkKey({
          savedId: value.savedId ?? null,
          unsavedId:
            typeof value.feature.get("unsavedId") === "string"
              ? String(value.feature.get("unsavedId"))
              : null,
        });
        if (
          !contextLinkKey ||
          getLinkedMeasurementGroup(useMapStore.getState().measurementLinks, contextLinkKey).length <= 1
        ) {
          return null;
        }
        return (
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-blue-600 hover:bg-gray-100 dark:text-blue-400 dark:hover:bg-gray-700"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("select-linked-measurements", {
                  detail: { linkKey: contextLinkKey },
                }),
              );
              onClose();
            }}
          >
            <Link2 size={13} /> Valitse yhdistetyt
          </button>
        );
      })()}
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
