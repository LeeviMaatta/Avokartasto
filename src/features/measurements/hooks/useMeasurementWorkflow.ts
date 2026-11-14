import { useCallback, useEffect, useRef, useState } from "react";
import GeoJSON from "ol/format/GeoJSON";
import Polygon from "ol/geom/Polygon";
import { getArea, getLength } from "ol/sphere";
import { useMapStore } from "../../../store/mapStore";
import { addFeature, deleteFeature, updateFeature, type UserFeature } from "../../../infrastructure/tauri";
import { requestConfirmation } from "../../../app/confirmation";
import { optimizeDistanceMeasurementToTerrainRoute } from "../domain/terrainGridLoader";
import type { TerrainRoutePreset, TerrainRouteStats } from "../domain/terrainRouting";
import { resolveNearestPlaceName } from "../../search/services/reverseGeocode";
import type { Measure, ProfilePoint, SelectedFeature } from "../../map/model/mapTypes";

interface UseMeasurementWorkflowOptions {
  measure: Measure | null;
  profile: ProfilePoint[] | null;
  editingFeatureId: number | null;
  activeUnsavedMeasurementId: string | null;
  selectedFeature: SelectedFeature | null;
  enableTerrainRouting: boolean;
  savedMeasurementColor: string;
  bumpFeatures: () => void;
  setMsg: (msg: string) => void;
  onClearMarkerDraft: () => void;
}

export function useMeasurementWorkflow({
  measure,
  profile,
  editingFeatureId,
  activeUnsavedMeasurementId,
  selectedFeature,
  enableTerrainRouting,
  savedMeasurementColor,
  bumpFeatures,
  setMsg,
  onClearMarkerDraft,
}: UseMeasurementWorkflowOptions) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState("");
  const [savingMeasurement, setSavingMeasurement] = useState(false);
  const savingMeasurementRef = useRef(false);

  const [terrainRouting, setTerrainRouting] = useState(false);
  const [terrainStage, setTerrainStage] = useState("");
  const [terrainOptionsOpen, setTerrainOptionsOpen] = useState(false);
  const [avoidSwamp, setAvoidSwamp] = useState(true);
  const [avoidWater, setAvoidWater] = useState(true);
  const [avoidStreams, setAvoidStreams] = useState(false);
  const [terrainPreset, setTerrainPreset] = useState<TerrainRoutePreset>("min-climb");
  const [originalGeojsonBeforeRoute, setOriginalGeojsonBeforeRoute] = useState<string | null>(null);
  const [originalProfileBeforeRoute, setOriginalProfileBeforeRoute] = useState<ProfilePoint[] | null>(null);
  const [terrainStats, setTerrainStats] = useState<TerrainRouteStats | null>(null);
  const terrainAbortRef = useRef<AbortController | null>(null);
  const lastRoutedGeojsonRef = useRef<string | null>(null);

  const clearTerrainAndFields = useCallback(() => {
    terrainAbortRef.current?.abort();
    terrainAbortRef.current = null;
    lastRoutedGeojsonRef.current = null;
    setTerrainRouting(false);
    setTerrainStage("");
    setTerrainOptionsOpen(false);
    setOriginalGeojsonBeforeRoute(null);
    setOriginalProfileBeforeRoute(null);
    setTerrainStats(null);
    setTitle("");
    setDescription("");
    setFolderId("");
  }, []);

  useEffect(() => {
    if (selectedFeature?.kind === "measurement") {
      onClearMarkerDraft();
      setTitle(selectedFeature.title);
      setDescription(selectedFeature.description ?? "");
      setFolderId(selectedFeature.folder_id ?? "");
    } else if (!selectedFeature) {
      setTitle("");
      setDescription("");
      setFolderId("");
    }
  }, [selectedFeature, onClearMarkerDraft]);

  useEffect(() => {
    const handleEditMeasurement = (event: Event) => {
      const feature = (event as CustomEvent<UserFeature>).detail;
      if (!feature) return;
      let geometry;
      try {
        geometry = new GeoJSON().readGeometry(JSON.parse(feature.geojson), {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        });
      } catch (error) {
        setMsg(`Mittauksen avaaminen epäonnistui: ${String(error)}`);
        return;
      }
      const kind = geometry instanceof Polygon ? "area" : "distance";
      const length = kind === "area"
        ? getArea(geometry, { projection: "EPSG:3857" })
        : getLength(geometry, { projection: "EPSG:3857" });
      clearTerrainAndFields();
      onClearMarkerDraft();
      setTitle(feature.title);
      setDescription(feature.description ?? "");
      setFolderId(feature.folder_id ?? "");
      setMsg("");
      useMapStore.setState({
        pendingMarker: null,
        markerEditorOpen: false,
        tool: "none",
        editingFeatureId: feature.id,
        activeUnsavedMeasurementId: null,
        measure: { length, geojson: feature.geojson, kind },
        profile: null,
        profileVisible: false,
        profileError: null,
        selectedFeature: {
          id: feature.id,
          kind: "measurement",
          title: feature.title,
          description: feature.description,
          color: feature.color || "#dc2626",
          folder_id: feature.folder_id,
          geojson: feature.geojson,
        },
      });
    };
    window.addEventListener("open-measurement-editor", handleEditMeasurement);
    return () => window.removeEventListener("open-measurement-editor", handleEditMeasurement);
  }, [clearTerrainAndFields, onClearMarkerDraft, setMsg]);

  useEffect(() => () => {
    terrainAbortRef.current?.abort();
    terrainAbortRef.current = null;
  }, []);

  useEffect(() => {
    if (!measure || (lastRoutedGeojsonRef.current && measure.geojson !== lastRoutedGeojsonRef.current)) {
      lastRoutedGeojsonRef.current = null;
      setOriginalGeojsonBeforeRoute(null);
      setOriginalProfileBeforeRoute(null);
      setTerrainStats(null);
      setTerrainStage("");
      setTerrainOptionsOpen(false);
    }
  }, [measure, editingFeatureId, activeUnsavedMeasurementId]);

  const resetActiveMeasurementState = (closeTool = false) => {
    useMapStore.setState({
      ...(closeTool ? { tool: "none" as const } : {}),
      measure: null,
      profile: null,
      profileVisible: false,
      profileError: null,
      editingFeatureId: null,
      activeUnsavedMeasurementId: null,
      selectedFeature: null,
    });
    clearTerrainAndFields();
    setMsg("");
  };

  const closeMeasureTool = () => {
    if (editingFeatureId !== null) {
      window.dispatchEvent(new CustomEvent("remove-measurement-feature", { detail: { savedId: editingFeatureId } }));
    }
    resetActiveMeasurementState(true);
  };

  const saveMeasurement = async () => {
    if (!measure || savingMeasurementRef.current) return;
    savingMeasurementRef.current = true;
    setSavingMeasurement(true);
    setMsg("");
    const currentState = useMapStore.getState();
    const targetSavedId = currentState.editingFeatureId ?? editingFeatureId;
    const targetUnsavedId = currentState.activeUnsavedMeasurementId ?? activeUnsavedMeasurementId;
    const targetMeasure = currentState.measure ?? measure;
    try {
      const resolvedTitle =
        title.trim() ||
        (await resolveNearestPlaceName(targetMeasure.geojson, "Mittaus"));
      const resolvedDescription = description.trim() || null;
      const featureType = targetMeasure.kind === "area" ? "POLYGON" : "LINESTRING";
      if (targetSavedId !== null) {
        await updateFeature(
          targetSavedId,
          resolvedTitle,
          resolvedDescription,
          featureType,
          targetMeasure.geojson,
          folderId,
          savedMeasurementColor,
        );
      } else {
        await addFeature(resolvedTitle, resolvedDescription, featureType, targetMeasure.geojson, folderId, savedMeasurementColor);
      }
      bumpFeatures();
      window.dispatchEvent(
        new CustomEvent("remove-measurement-feature", {
          detail:
            targetSavedId !== null
              ? { savedId: targetSavedId }
              : { unsavedId: targetUnsavedId, geojson: targetMeasure.geojson },
        }),
      );
      useMapStore.setState({
        measure: null,
        profile: null,
        profileVisible: false,
        profileError: null,
        editingFeatureId: null,
        activeUnsavedMeasurementId: null,
        selectedFeature: null,
      });
      setTitle("");
      setDescription("");
      setFolderId("");
      setMsg("Tallennettu");
    } catch (error) {
      setMsg(`Tallennus epäonnistui: ${String(error)}`);
    } finally {
      savingMeasurementRef.current = false;
      setSavingMeasurement(false);
    }
  };

  const deleteCurrentMeasurement = async (): Promise<boolean> => {
    if (editingFeatureId !== null) {
      const label = title.trim() || selectedFeature?.title || "Mittaus";
      if (!(await requestConfirmation(`Haluatko varmasti poistaa mittauksen "${label}"?`))) return false;
      await deleteFeature(editingFeatureId);
      bumpFeatures();
      window.dispatchEvent(new CustomEvent("remove-measurement-feature", { detail: { savedId: editingFeatureId } }));
    } else if (activeUnsavedMeasurementId) {
      window.dispatchEvent(new CustomEvent("remove-measurement-feature", { detail: { unsavedId: activeUnsavedMeasurementId } }));
    } else {
      return false;
    }
    resetActiveMeasurementState(false);
    return true;
  };

  const chooseType = (nextType: "distance" | "area") => {
    if (editingFeatureId !== null) {
      window.dispatchEvent(new CustomEvent("remove-measurement-feature", { detail: { savedId: editingFeatureId } }));
    }
    resetActiveMeasurementState(false);
    void useMapStore.getState().setSetting("measurementType", nextType);
  };

  const runTerrainRoute = async () => {
    if (!enableTerrainRouting || !measure || measure.kind !== "distance" || terrainRouting) return;
    const baseGeojson = originalGeojsonBeforeRoute ?? measure.geojson;
    const baseProfile = originalProfileBeforeRoute ?? profile;
    terrainAbortRef.current?.abort();
    const controller = new AbortController();
    terrainAbortRef.current = controller;
    setTerrainRouting(true);
    setTerrainStage("Haetaan maasto- ja korkeustietoja...");
    setTerrainOptionsOpen(false);
    setMsg("");

    try {
      const result = await optimizeDistanceMeasurementToTerrainRoute(
        baseGeojson,
        {
          preset: terrainPreset,
          avoidSwamp,
          avoidWater,
          avoidStreams,
        },
        controller.signal,
        {
          onStage: (stageLabel) => {
            if (terrainAbortRef.current === controller) {
              setTerrainStage(stageLabel);
            }
          },
        },
      );
      if (terrainAbortRef.current !== controller) return;
      if (!originalGeojsonBeforeRoute) {
        setOriginalGeojsonBeforeRoute(baseGeojson);
        setOriginalProfileBeforeRoute(baseProfile);
      }
      lastRoutedGeojsonRef.current = result.geojson;
      setTerrainStats(result.stats);
      window.dispatchEvent(
        new CustomEvent("replace-measurement-geometry", {
          detail: {
            savedId: editingFeatureId,
            unsavedId: activeUnsavedMeasurementId,
            geojson: result.geojson,
            profile: result.profile,
          },
        }),
      );
      if (result.warnings.length > 0) {
        setMsg(result.warnings[0]);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setMsg(`Maastoreititys epäonnistui: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (terrainAbortRef.current === controller) {
        terrainAbortRef.current = null;
        setTerrainRouting(false);
        setTerrainStage("");
      }
    }
  };

  const restoreOriginalMeasurement = () => {
    if (!originalGeojsonBeforeRoute) return;
    const restored = originalGeojsonBeforeRoute;
    const restoredProfile = originalProfileBeforeRoute;
    lastRoutedGeojsonRef.current = null;
    setOriginalGeojsonBeforeRoute(null);
    setOriginalProfileBeforeRoute(null);
    setTerrainStats(null);
    setMsg("");
    window.dispatchEvent(
      new CustomEvent("replace-measurement-geometry", {
        detail: {
          savedId: editingFeatureId,
          unsavedId: activeUnsavedMeasurementId,
          geojson: restored,
          profile: restoredProfile,
        },
      }),
    );
  };

  return {
    title,
    setTitle,
    description,
    setDescription,
    folderId,
    setFolderId,
    savingMeasurement,
    terrainRouting,
    terrainStage,
    terrainOptionsOpen,
    setTerrainOptionsOpen,
    avoidSwamp,
    setAvoidSwamp,
    avoidWater,
    setAvoidWater,
    avoidStreams,
    setAvoidStreams,
    terrainPreset,
    setTerrainPreset,
    originalGeojsonBeforeRoute,
    terrainStats,
    clearTerrainAndFields,
    closeMeasureTool,
    saveMeasurement,
    deleteCurrentMeasurement,
    chooseType,
    runTerrainRoute,
    restoreOriginalMeasurement,
  };
}
