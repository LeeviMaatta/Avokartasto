import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Download, Loader2, MapPin, Mountain, Pencil, Save, SlidersHorizontal, Trash2, Undo2, X } from "lucide-react";
import GeoJSON from "ol/format/GeoJSON";
import Polygon from "ol/geom/Polygon";
import { getArea, getLength } from "ol/sphere";
import { useMapStore } from "../../../store/mapStore";
import { addFeature, deleteFeature, updateFeature, type UserFeature } from "../../../infrastructure/tauriBridge";
import { requestConfirmation } from "../../../app/confirmation";
import { exportMeasurement as saveMeasurementFile } from "../../measurements/domain/measurementExport";
import { formatArea, formatDistance } from "../../measurements/domain/measurementFormatting";
import { optimizeDistanceMeasurementToTerrainRoute } from "../../measurements/domain/terrainGridLoader";
import type { TerrainRoutePreset, TerrainRouteStats } from "../../measurements/domain/terrainRouting";
import MarkerEditor, { type MarkerDraft, type MarkerFolder } from "../../measurements/components/MarkerEditor";
import { resolveNearestPlaceName } from "../sources/reverseGeocode";
import { focusMapViewport, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";

const emptyMarkerDraft = (geojson: string, folderId = ""): MarkerDraft => ({
  title: "",
  description: "",
  color: "#dc2626",
  folderId,
  geojson,
});

export default function MeasureTool() {
  const tool = useMapStore((s) => s.tool);
  const measure = useMapStore((s) => s.measure);
  const bumpFeatures = useMapStore((s) => s.bumpFeatures);
  const editingFeatureId = useMapStore((s) => s.editingFeatureId);
  const activeUnsavedMeasurementId = useMapStore((s) => s.activeUnsavedMeasurementId);
  const units = useMapStore((s) => s.settings.measurementUnits ?? "metric");
  const areaUnit = useMapStore((s) => s.settings.areaUnit ?? "auto");
  const measurementType = useMapStore((s) => s.settings.measurementType ?? "distance");
  const enableTerrainRouting = useMapStore((s) => s.settings.enableTerrainRouting !== "0");
  const savedMarkerColor = useMapStore((s) => s.settings.savedMarkerColor || "#dc2626");
  const savedMeasurementColor = useMapStore((s) => s.settings.savedMeasurementColor || "#16a34a");
  const markerFoldersSetting = useMapStore((s) => s.settings.markerFolders);
  const rawOverlayOpacity = Number(useMapStore((s) => s.settings.uiOverlayOpacity ?? "1"));
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;
  const pendingMarker = useMapStore((s) => s.pendingMarker);
  const selectedFeature = useMapStore((s) => s.selectedFeature);
  const profile = useMapStore((s) => s.profile);
  const profileError = useMapStore((s) => s.profileError);
  const profileVisible = useMapStore((s) => s.profileVisible);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState("");
  const [msg, setMsg] = useState("");
  const [markerDraft, setMarkerDraft] = useState<MarkerDraft | null>(null);
  const [markerBusy, setMarkerBusy] = useState(false);
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
  const [originalProfileBeforeRoute, setOriginalProfileBeforeRoute] = useState<Array<{ dist: number; elev: number | null }> | null>(null);
  const [terrainStats, setTerrainStats] = useState<TerrainRouteStats | null>(null);
  const terrainAbortRef = useRef<AbortController | null>(null);
  const lastRoutedGeojsonRef = useRef<string | null>(null);

  const markerFolders = useMemo<MarkerFolder[]>(() => {
    try {
      const parsed: unknown = JSON.parse(markerFoldersSetting ?? "[]");
      return Array.isArray(parsed)
        ? parsed.filter((folder): folder is MarkerFolder => Boolean(folder) && typeof folder.id === "string" && typeof folder.name === "string")
        : [];
    } catch {
      return [];
    }
  }, [markerFoldersSetting]);

  useEffect(() => {
    if (selectedFeature?.kind === "measurement") {
      setMarkerDraft(null);
      setTitle(selectedFeature.title);
      setDescription(selectedFeature.description ?? "");
      setFolderId(selectedFeature.folder_id ?? "");
    } else if (!selectedFeature) {
      setTitle("");
      setDescription("");
      setFolderId("");
    }
  }, [selectedFeature]);

  useEffect(() => {
    if (msg !== "Tallennettu") return;
    const timer = window.setTimeout(() => setMsg(""), 2500);
    return () => window.clearTimeout(timer);
  }, [msg]);

  // LayerSwitcher lähettää muokattavan merkin tänne, jotta kaikki tallennus
  // ja muokkaus tapahtuu samassa kartan yläreunan työkalupalkissa.
  useEffect(() => {
    const handleEditMarker = (event: Event) => {
      const feature = (event as CustomEvent<UserFeature>).detail;
      if (!feature) return;
      const currentState = useMapStore.getState();
      if (currentState.editingFeatureId !== null || currentState.activeUnsavedMeasurementId !== null) {
        window.dispatchEvent(
          new CustomEvent("remove-measurement-feature", {
            detail: {
              savedId: currentState.editingFeatureId,
              unsavedId: currentState.activeUnsavedMeasurementId,
            },
          }),
        );
      }
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
      useMapStore.setState({
        tool: "none",
        pendingMarker: null,
        markerEditorOpen: true,
        editingFeatureId: null,
        activeUnsavedMeasurementId: null,
        measure: null,
        profile: null,
        profileVisible: false,
        profileError: null,
        selectedFeature: null,
      });
      setMarkerDraft({
        id: feature.id,
        title: feature.title,
        description: feature.description ?? "",
        color: feature.color || "#dc2626",
        folderId: feature.folder_id ?? "",
        geojson: feature.geojson,
      });
      setMsg("");
    };
    window.addEventListener("open-marker-editor", handleEditMarker);
    return () => window.removeEventListener("open-marker-editor", handleEditMarker);
  }, []);

  useEffect(() => {
    if (!pendingMarker || tool === "measure") {
      setMarkerDraft((prev) => (prev && prev.id === undefined ? null : prev));
      return;
    }
    setMarkerDraft((prev) =>
      prev && prev.id !== undefined
        ? prev
        : emptyMarkerDraft(
            JSON.stringify({ type: "Point", coordinates: pendingMarker }),
            markerFolders[0]?.id ?? "",
          ),
    );
    setMsg("");
  }, [pendingMarker, tool, markerFolders]);

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
      terrainAbortRef.current?.abort();
      terrainAbortRef.current = null;
      lastRoutedGeojsonRef.current = null;
      setTerrainRouting(false);
      setTerrainStage("");
      setTerrainOptionsOpen(false);
      setOriginalGeojsonBeforeRoute(null);
      setOriginalProfileBeforeRoute(null);
      setTerrainStats(null);
      setMarkerDraft(null);
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
  }, []);

  const saveMarker = async () => {
    if (!markerDraft || markerBusy) return;
    setMarkerBusy(true);
    setMsg("");
    try {
      const resolvedTitle =
        markerDraft.title.trim() ||
        (await resolveNearestPlaceName(markerDraft.geojson, "Merkki"));
      const args = [
        resolvedTitle,
        markerDraft.description.trim() || null,
        "POINT",
        markerDraft.geojson,
        markerDraft.folderId,
        savedMarkerColor,
        null,
      ] as const;
      if (markerDraft.id !== undefined) await updateFeature(markerDraft.id, ...args);
      else await addFeature(...args);
      bumpFeatures();
      setMarkerDraft(null);
      useMapStore.setState({ pendingMarker: null, markerEditorOpen: false, selectedFeature: null });
      setMsg("Tallennettu");
    } catch (error) {
      setMsg(`Tallennus epäonnistui: ${String(error)}`);
    } finally {
      setMarkerBusy(false);
    }
  };

  const cancelMarkerEdit = () => {
    setMarkerDraft(null);
    useMapStore.setState({ pendingMarker: null, markerEditorOpen: false });
  };

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
    terrainAbortRef.current?.abort();
    terrainAbortRef.current = null;
    lastRoutedGeojsonRef.current = null;
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
    setTerrainRouting(false);
    setTerrainStage("");
    setTerrainOptionsOpen(false);
    setOriginalGeojsonBeforeRoute(null);
    setOriginalProfileBeforeRoute(null);
    setTerrainStats(null);
    setMsg("");
    setTitle("");
    setDescription("");
    setFolderId("");
  };

  const closeMeasureTool = () => {
    if (editingFeatureId !== null) {
      window.dispatchEvent(new CustomEvent("remove-measurement-feature", { detail: { savedId: editingFeatureId } }));
    }
    resetActiveMeasurementState(true);
  };

  const escapeActionRef = useRef<(() => void) | null>(null);
  if (markerDraft && tool !== "measure") {
    escapeActionRef.current = () => {
      cancelMarkerEdit();
      focusMapViewport();
    };
  } else if (selectedFeature?.kind === "marker" && tool !== "measure") {
    escapeActionRef.current = () => {
      useMapStore.setState({ selectedFeature: null });
      focusMapViewport();
    };
  } else if (tool === "measure" || Boolean(selectedFeature) || Boolean(activeUnsavedMeasurementId)) {
    escapeActionRef.current = () => {
      closeMeasureTool();
      focusMapViewport();
    };
  } else {
    escapeActionRef.current = null;
  }

  const hasEscapeTarget = Boolean(escapeActionRef.current);
  useEffect(() => {
    if (!hasEscapeTarget) return;
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"], [data-shortcut-capturing="true"]')) return;
      const action = escapeActionRef.current;
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [hasEscapeTarget]);

  const deleteMarker = async () => {
    if (!markerDraft) return;
    if (markerDraft.id !== undefined) {
      if (await requestConfirmation(`Haluatko varmasti poistaa merkin "${markerDraft.title || "Merkki"}"?`)) {
        await deleteFeature(markerDraft.id);
        bumpFeatures();
        setMarkerDraft(null);
        useMapStore.setState({ pendingMarker: null, markerEditorOpen: false, selectedFeature: null });
        setMsg("");
      }
    } else {
      setMarkerDraft(null);
      useMapStore.setState({ pendingMarker: null, markerEditorOpen: false, selectedFeature: null });
      setMsg("");
    }
  };

  if (markerDraft && tool !== "measure") {
    return (
      <MarkerEditor 
        draft={markerDraft} 
        folders={markerFolders} 
        opacity={overlayOpacity} 
        busy={markerBusy} 
        message={msg} 
        onChange={setMarkerDraft} 
        onSave={() => void saveMarker()} 
        onCancel={cancelMarkerEdit}
        onDelete={() => void deleteMarker()}
      />
    );
  }

  if (msg === "Tallennettu" && tool !== "measure" && !selectedFeature && !markerDraft) {
    return (
      <div className="absolute left-1/2 top-16 sm:top-20 z-10 -translate-x-1/2 rounded-xl border border-emerald-200 bg-white/95 px-4 py-2 text-sm text-emerald-700 shadow-xl backdrop-blur-md dark:border-emerald-800 dark:bg-zinc-950/95 dark:text-emerald-400" style={{ opacity: overlayOpacity }}>
        {msg}
      </div>
    );
  }

  if (tool !== "measure" && !selectedFeature && !activeUnsavedMeasurementId) return null;

  if (selectedFeature?.kind === "marker" && tool !== "measure") {
    return (
      <div
        onKeyDown={(e) => handleContainerArrowKeyDown(e, { orientation: "horizontal", onEscape: () => { useMapStore.setState({ selectedFeature: null }); focusMapViewport(); } })}
        className="absolute left-2 right-2 top-16 sm:top-20 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs sm:text-sm text-slate-800 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:flex-nowrap sm:px-4"
        style={{ opacity: overlayOpacity }}
      >
        <span className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white"><MapPin size={16} style={{ color: savedMarkerColor }} /> Merkki</span>
        <span className="max-w-48 truncate font-medium">{selectedFeature.title}</span>
        <button className="flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800 transition" onClick={() => {
          setMarkerDraft({
            id: selectedFeature.id,
            title: selectedFeature.title,
            description: selectedFeature.description ?? "",
            color: selectedFeature.color || "#dc2626",
            folderId: selectedFeature.folder_id ?? "",
            geojson: selectedFeature.geojson ?? "",
          });
        }}><Pencil size={13} /> Muokkaa</button>
        <button 
          className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/60 transition"
          onClick={async () => {
            if (await requestConfirmation(`Haluatko varmasti poistaa merkin "${selectedFeature.title || "Merkki"}"?`)) {
              await deleteFeature(selectedFeature.id);
              bumpFeatures();
              useMapStore.setState({ selectedFeature: null });
            }
          }}
          title="Poista merkki"
        >
          <Trash2 size={13} /> <span>Poista</span>
        </button>
        <button onClick={() => useMapStore.setState({ selectedFeature: null })} title="Sulje" aria-label="Sulje" className="rounded p-1 hover:bg-slate-100 dark:hover:bg-zinc-800"><X size={16} /></button>
      </div>
    );
  }

  const save = async () => {
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
      useMapStore.setState({ measure: null, profile: null, profileVisible: false, profileError: null, editingFeatureId: null, activeUnsavedMeasurementId: null, selectedFeature: null });
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

  const deleteCurrentMeasurement = async () => {
    if (editingFeatureId !== null) {
      const label = title.trim() || selectedFeature?.title || "Mittaus";
      if (!(await requestConfirmation(`Haluatko varmasti poistaa mittauksen "${label}"?`))) return;
      await deleteFeature(editingFeatureId);
      bumpFeatures();
      window.dispatchEvent(new CustomEvent("remove-measurement-feature", { detail: { savedId: editingFeatureId } }));
    } else if (activeUnsavedMeasurementId) {
      window.dispatchEvent(new CustomEvent("remove-measurement-feature", { detail: { unsavedId: activeUnsavedMeasurementId } }));
    }
    resetActiveMeasurementState(false);
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

  const msgIsError =
    msg.startsWith("Tallennus epäonnistui") ||
    msg.startsWith("Vienti epäonnistui") ||
    msg.startsWith("Maastoreititys epäonnistui");

  return (
    <div
      onKeyDown={(e) => handleContainerArrowKeyDown(e, { orientation: "horizontal", onEscape: () => { closeMeasureTool(); focusMapViewport(); } })}
      className="absolute left-2 right-2 top-16 sm:top-20 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs sm:text-sm text-slate-800 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 sm:left-1/2 sm:right-auto sm:max-w-[min(96vw,68rem)] sm:-translate-x-1/2 sm:gap-2.5 sm:px-4"
      style={{ opacity: overlayOpacity }}
    >
      <span className="whitespace-nowrap font-semibold text-slate-900 dark:text-white">{selectedFeature?.title ? `Mittaus: ${selectedFeature.title}` : "Mittaus"}</span>
      {!measure && (
        <>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-zinc-900">
            <button className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${measurementType !== "area" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"}`} onClick={() => chooseType("distance")}>Etäisyys</button>
            <button className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${measurementType === "area" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"}`} onClick={() => chooseType("area")}>Pinta-ala</button>
          </div>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400">Piirrä klikkaamalla, lopeta tuplaklikkauksella</span>
        </>
      )}
      {measure && (
        <>
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium dark:bg-zinc-900">
            {measure.kind === "area"
              ? <>Ala: <b className="text-slate-900 dark:text-white">{formatArea(measure.length, areaUnit)}</b></>
              : <>Pituus: <b className="text-slate-900 dark:text-white">{formatDistance(measure.length, units)}</b></>}
          </span>
          {measure.kind === "distance" && enableTerrainRouting && terrainStats && (
            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" title="Arvioitu nousu ennen ja jälkeen optimoinnin">
              Nousu: <b>{Math.round(terrainStats.originalClimbM)} m → {Math.round(terrainStats.routedClimbM)} m</b>
            </span>
          )}
          <input className="w-28 sm:w-36 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" placeholder="Mittauksen nimi" aria-label="Mittauksen nimi" value={title} onChange={(event) => setTitle(event.target.value)} />
          <input className="w-28 sm:w-40 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" placeholder="Kuvaus" aria-label="Mittauksen kuvaus" value={description} onChange={(event) => setDescription(event.target.value)} />
          <select
            className="max-w-36 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Mittauksen kansio"
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
          >
            <option value="">Ei kansiota</option>
            {markerFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          <button disabled={savingMeasurement} className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-blue-700 disabled:opacity-60 transition" onClick={() => void save()}>
            <Save size={13} /> {editingFeatureId ? "Tallenna muutokset" : "Tallenna"}
          </button>
          <button className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-red-700 transition" onClick={() => void deleteCurrentMeasurement()} title="Poista mittaus">
            <Trash2 size={13} /> Poista
          </button>
          <button
            className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 transition"
            onClick={() => {
              if (!measure) return;
              void saveMeasurementFile(measure, title, description)
                .then((res) => {
                  if (res.status === "saved") setMsg(`Viety: ${res.path}`);
                })
                .catch((err) => {
                  setMsg(`Vienti epäonnistui: ${err instanceof Error ? err.message : String(err)}`);
                });
            }}
            title="Vie GeoJSON-tiedostona"
          >
            <Download size={13} /> Vie
          </button>
          {measure.kind === "distance" && (
            <>
              {enableTerrainRouting && (
                <>
                  <div className="relative flex items-center">
                    <button
                      type="button"
                      disabled={terrainRouting}
                      className="flex items-center gap-1 rounded-l-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-emerald-700 disabled:opacity-60 transition"
                      onClick={() => void runTerrainRoute()}
                      title="Muuta etäisyysmittaus maastoreitiksi (vähiten nousua)"
                    >
                      {terrainRouting ? <Loader2 size={13} className="animate-spin" /> : <Mountain size={13} />}
                      <span>{terrainRouting ? (terrainStage || "Haetaan...") : "Maastoreitti"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={terrainRouting}
                      aria-expanded={terrainOptionsOpen}
                      aria-label="Maastoreitin asetukset"
                      title="Maastoreitin lisävalinnat"
                      className="rounded-r-lg border-l border-emerald-700 bg-emerald-600 px-1.5 py-1 text-white shadow hover:bg-emerald-700 disabled:opacity-60 transition"
                      onClick={() => setTerrainOptionsOpen((prev) => !prev)}
                    >
                      <SlidersHorizontal size={13} />
                    </button>
                    {terrainOptionsOpen && (
                      <div className="absolute right-0 top-full z-30 mt-2 w-60 space-y-2 rounded-xl border border-slate-200 bg-white/95 p-3 text-xs text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100">
                        <div className="font-semibold text-slate-900 dark:text-white">Maastoreitin asetukset</div>
                        <label className="flex cursor-pointer items-center justify-between gap-2">
                          <span>Kierrä suoalueet</span>
                          <input
                            type="checkbox"
                            checked={avoidSwamp}
                            onChange={(e) => setAvoidSwamp(e.target.checked)}
                            className="accent-emerald-600"
                          />
                        </label>
                        <label className="flex cursor-pointer items-center justify-between gap-2">
                          <span>Kierrä vesistöt</span>
                          <input
                            type="checkbox"
                            checked={avoidWater}
                            onChange={(e) => setAvoidWater(e.target.checked)}
                            className="accent-emerald-600"
                          />
                        </label>
                        <label className={`flex items-center justify-between gap-2 pl-3 text-[11px] ${avoidWater ? "cursor-pointer text-slate-600 dark:text-zinc-300" : "cursor-not-allowed text-slate-400 opacity-60 dark:text-zinc-500"}`}>
                          <span>Kierrä purot ja ojat</span>
                          <input
                            type="checkbox"
                            checked={avoidStreams}
                            disabled={!avoidWater}
                            onChange={(e) => setAvoidStreams(e.target.checked)}
                            className="accent-emerald-600"
                          />
                        </label>
                        <div className="space-y-1 border-t border-slate-100 pt-2 dark:border-zinc-800">
                          <div className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Optimointi</div>
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              onClick={() => setTerrainPreset("min-climb")}
                              className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                                terrainPreset === "min-climb"
                                  ? "bg-emerald-600 text-white"
                                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              }`}
                            >
                              Vähiten nousua
                            </button>
                            <button
                              type="button"
                              onClick={() => setTerrainPreset("balanced")}
                              className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                                terrainPreset === "balanced"
                                  ? "bg-emerald-600 text-white"
                                  : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              }`}
                            >
                              Tasapainoinen
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {originalGeojsonBeforeRoute && (
                    <button
                      type="button"
                      disabled={terrainRouting}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 transition"
                      onClick={restoreOriginalMeasurement}
                      title="Palauta alkuperäinen suora mittaus"
                    >
                      <Undo2 size={13} /> Palauta
                    </button>
                  )}
                </>
              )}
              <button
                className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${profileVisible ? "bg-blue-600 text-white shadow-xs" : "border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"}`}
                onClick={() => useMapStore.setState({ profileVisible: !profileVisible })}
                disabled={!profile && !profileError}
                title="Näytä tai piilota korkeusprofiili"
              >
                <BarChart3 size={13} /> Korkeusprofiili
              </button>
            </>
          )}
        </>
      )}
      {msg && <span className={msgIsError ? "text-red-600 dark:text-red-400 text-xs font-medium" : "text-emerald-600 dark:text-emerald-400 text-xs font-medium"}>{msg}</span>}
      <button onClick={closeMeasureTool} title="Sulje" aria-label="Sulje" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"><X size={16} /></button>
    </div>
  );
}
