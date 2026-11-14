import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import Collection from "ol/Collection";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import LineString from "ol/geom/LineString";
import Feature from "ol/Feature";
import VectorSource from "ol/source/Vector";
import OlMap from "ol/Map";
import {
  prepareJunctionFeaturesForModify,
  selectJunctionMeasurements,
  syncMeasurementFeatureToStore,
  updateMultiModifiedMeasurements,
} from "../../measurements/domain/measurementInteractionSync";
import {
  clearSavedEditFeatures,
  ensureUnsavedMeasurementId,
  findEditableMeasurementFeatures,
} from "../../measurements/domain/measurementSource";
import {
  findMatchingEndpointFeatures,
  findMeasurementEndpointAtPixel,
  isClickWithoutDrag,
  setActiveDrawingMeasurement,
  suppressMeasurementSingleClick,
} from "../../measurements/domain/measurementEndpointAction";
import { toMeasurementLinkKey } from "../../measurements/domain/measurementSelection";
import { useMapStore } from "../../../store/mapStore";

interface MapMeasurementOptions {
  mapRef: RefObject<OlMap | null>;
  measureSource: MutableRefObject<VectorSource>;
  featureSource?: MutableRefObject<VectorSource>;
  profileRequest: MutableRefObject<number>;
  tool: string;
  measurementType: string;
  editingFeatureId: number | null;
  activeUnsavedMeasurementId: string | null;
}

export function useMapMeasurementInteractions({
  mapRef,
  measureSource,
  featureSource,
  profileRequest,
  tool,
  measurementType,
  editingFeatureId,
  activeUnsavedMeasurementId,
}: MapMeasurementOptions) {
  const pendingEndpointStartRef = useRef<{
    coord: [number, number];
    sourceUnsavedId: string | null;
  } | null>(null);
  const pendingLinkSourceUnsavedIdRef = useRef<string | null>(null);
  const hasSelection = useMapStore((s) => s.selectedMeasurements.length > 0);

  useEffect(() => {
    const canDraw = tool === "measure";
    const canModify = canDraw || editingFeatureId !== null || activeUnsavedMeasurementId !== null || hasSelection;
    if (!canDraw && !canModify) return;
    const map = mapRef.current;
    if (!map) return;

    const draw = canDraw
      ? new Draw({
          source: measureSource.current,
          type: measurementType === "area" ? "Polygon" : "LineString",
        })
      : null;
    const editableCollection = new Collection<Feature>();
    const syncEditableCollection = () => {
      const state = useMapStore.getState();
      const targets = findEditableMeasurementFeatures(
        measureSource.current,
        state.editingFeatureId,
        state.activeUnsavedMeasurementId,
        state.selectedMeasurements,
      );
      const current = editableCollection.getArray();
      if (current.length === targets.length && targets.every((feat, idx) => current[idx] === feat)) {
        return;
      }
      editableCollection.clear();
      targets.forEach((feat) => editableCollection.push(feat));
    };
    syncEditableCollection();
    const modify = new Modify({ features: editableCollection });

    let isDrawing = false;
    let drawStartedDuringClick = false;
    let activeSketchFeature: Feature | null = null;
    let suppressNextModifyEnd = false;
    let endpointCandidate: {
      pixel: [number, number];
      coord: [number, number];
      sourceUnsavedId: string | null;
    } | null = null;

    draw?.on("drawend", (event) => {
      isDrawing = false;
      activeSketchFeature = null;
      setActiveDrawingMeasurement(false);
      const feature = event.feature as Feature;
      clearSavedEditFeatures(measureSource.current);
      const newId = ensureUnsavedMeasurementId(feature);
      const linkSourceId = pendingLinkSourceUnsavedIdRef.current;
      pendingLinkSourceUnsavedIdRef.current = null;
      if (linkSourceId && linkSourceId !== newId) {
        useMapStore.getState().linkMeasurements(linkSourceId, newId);
      }
      void syncMeasurementFeatureToStore(feature, profileRequest, false);
    });
    modify.on("modifyend", (event) => {
      if (suppressNextModifyEnd) {
        suppressNextModifyEnd = false;
        return;
      }
      const state = useMapStore.getState();
      const modifiedFeatures = event.features.getArray() as Feature[];
      if (state.selectedMeasurements.length > 1) {
        updateMultiModifiedMeasurements(modifiedFeatures);
        return;
      }
      const feature = modifiedFeatures[0];
      if (feature) void syncMeasurementFeatureToStore(feature, profileRequest, true);
    });

    const viewport = map.getViewport();
    let pendingJunctionDrag: {
      pixel: [number, number];
      features: Feature[];
      tempClonedSavedIds: number[];
    } | null = null;

    const commitPendingJunctionDrag = () => {
      if (!pendingJunctionDrag) return;
      const { features } = pendingJunctionDrag;
      pendingJunctionDrag = null;
      selectJunctionMeasurements(features);
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || isDrawing) {
        endpointCandidate = null;
        pendingJunctionDrag = null;
        return;
      }
      const pixel = map.getEventPixel(event);
      const sources = featureSource
        ? [measureSource.current, featureSource.current]
        : [measureSource.current];
      const hit = findMeasurementEndpointAtPixel(map, sources, [pixel[0], pixel[1]], 12);
      if (!hit) {
        endpointCandidate = null;
        pendingJunctionDrag = null;
        return;
      }
      const sharedRaw = findMatchingEndpointFeatures(sources, hit.coord, 0.05);
      const editableSet = new Set(editableCollection.getArray());
      if (sharedRaw.length > 1 && sharedRaw.some((f) => editableSet.has(f))) {
        const { resolved, tempClonedSavedIds } = prepareJunctionFeaturesForModify(
          sharedRaw,
          measureSource.current,
        );
        const missing = resolved.filter((f) => !editableSet.has(f));
        missing.forEach((f) => editableCollection.push(f));
        pendingJunctionDrag =
          missing.length > 0
            ? { pixel: [pixel[0], pixel[1]], features: resolved, tempClonedSavedIds }
            : null;
      } else {
        pendingJunctionDrag = null;
      }
      const unsavedId =
        hit.unsavedId ?? (hit.savedId === null ? ensureUnsavedMeasurementId(hit.feature) : null);
      const sourceLinkKey = toMeasurementLinkKey({ savedId: hit.savedId, unsavedId });
      drawStartedDuringClick = false;
      endpointCandidate = {
        pixel: [pixel[0], pixel[1]],
        coord: hit.coord,
        sourceUnsavedId: sourceLinkKey,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pendingJunctionDrag) return;
      const movePixel = map.getEventPixel(event);
      if (isClickWithoutDrag(pendingJunctionDrag.pixel, [movePixel[0], movePixel[1]], 5)) return;
      commitPendingJunctionDrag();
    };

    const handlePointerUp = (event: PointerEvent) => {
      const candidate = endpointCandidate;
      endpointCandidate = null;
      if (!candidate || event.button !== 0) {
        pendingJunctionDrag = null;
        return;
      }
      const upPixel = map.getEventPixel(event);
      if (!isClickWithoutDrag(candidate.pixel, [upPixel[0], upPixel[1]], 5)) {
        commitPendingJunctionDrag();
        return;
      }
      if (pendingJunctionDrag) {
        const { tempClonedSavedIds } = pendingJunctionDrag;
        pendingJunctionDrag = null;
        tempClonedSavedIds.forEach((id) => clearSavedEditFeatures(measureSource.current, id));
        syncEditableCollection();
      }

      suppressMeasurementSingleClick();
      if (draw && measurementType !== "area") {
        pendingLinkSourceUnsavedIdRef.current = candidate.sourceUnsavedId;
        if (drawStartedDuringClick && activeSketchFeature) {
          const geom = activeSketchFeature.getGeometry();
          if (geom instanceof LineString) {
            const coords = geom.getCoordinates();
            if (coords.length > 0) {
              coords[0] = candidate.coord;
              geom.setCoordinates(coords);
            }
          }
        } else if (!isDrawing) {
          suppressNextModifyEnd = true;
          isDrawing = true;
          setActiveDrawingMeasurement(true);
          draw.appendCoordinates([candidate.coord]);
        }
        return;
      }

      suppressNextModifyEnd = true;
      pendingEndpointStartRef.current = {
        coord: candidate.coord,
        sourceUnsavedId: candidate.sourceUnsavedId,
      };
      if (measurementType === "area") {
        void useMapStore.getState().setSetting("measurementType", "distance");
      }
      useMapStore.setState({ tool: "measure" });
    };

    const unsubscribeSelection = useMapStore.subscribe((state, prevState) => {
      if (
        state.selectedMeasurements !== prevState.selectedMeasurements ||
        state.editingFeatureId !== prevState.editingFeatureId ||
        state.activeUnsavedMeasurementId !== prevState.activeUnsavedMeasurementId
      ) {
        syncEditableCollection();
      }
    });
    measureSource.current.on("addfeature", syncEditableCollection);
    measureSource.current.on("removefeature", syncEditableCollection);
    viewport.addEventListener("pointerdown", handlePointerDown, true);
    viewport.addEventListener("pointermove", handlePointerMove);
    viewport.addEventListener("pointerup", handlePointerUp);
    if (draw) map.addInteraction(draw);
    map.addInteraction(modify);

    if (draw && measurementType !== "area" && pendingEndpointStartRef.current) {
      const pending = pendingEndpointStartRef.current;
      pendingEndpointStartRef.current = null;
      pendingLinkSourceUnsavedIdRef.current = pending.sourceUnsavedId;
      isDrawing = true;
      setActiveDrawingMeasurement(true);
      draw.appendCoordinates([pending.coord]);
    }

    return () => {
      setActiveDrawingMeasurement(false);
      unsubscribeSelection();
      viewport.removeEventListener("pointerdown", handlePointerDown, true);
      viewport.removeEventListener("pointermove", handlePointerMove);
      viewport.removeEventListener("pointerup", handlePointerUp);
      measureSource.current.un("addfeature", syncEditableCollection);
      measureSource.current.un("removefeature", syncEditableCollection);
      editableCollection.clear();
      if (draw) map.removeInteraction(draw);
      map.removeInteraction(modify);
    };
  }, [mapRef, measureSource, profileRequest, tool, measurementType, editingFeatureId, activeUnsavedMeasurementId, hasSelection]);
}
