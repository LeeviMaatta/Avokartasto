import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, Download, Save, Trash2, X } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { exportMeasurement as saveMeasurementFile } from "../domain/measurementExport";
import { formatArea, formatDistance } from "../domain/measurementFormatting";
import MarkerEditor, { type MarkerFolder } from "../../markers/components/MarkerEditor";
import { SelectedMarkerBar } from "../../markers/components/SelectedMarkerBar";
import { useMarkerWorkflow } from "../../markers/hooks/useMarkerWorkflow";
import { useMeasurementWorkflow } from "../hooks/useMeasurementWorkflow";
import { TerrainOptionsPopover } from "./TerrainOptionsPopover";
import { focusMapViewport, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import { isTextInputTarget } from "../../settings/model/keyboardShortcuts";

function shouldIgnoreDeleteForInput(target: EventTarget | null): boolean {
  if (!isTextInputTarget(target)) return false;
  if (!(target instanceof HTMLElement)) return true;
  if (target.closest("[data-measure-tool='true']")) {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return target.value.length > 0;
    }
    if (target instanceof HTMLSelectElement) {
      return false;
    }
  }
  return true;
}

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
  const [msg, setMsg] = useState("");

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
    if (msg !== "Tallennettu") return;
    const timer = window.setTimeout(() => setMsg(""), 2500);
    return () => window.clearTimeout(timer);
  }, [msg]);

  const clearMeasurementFieldsRef = useRef<() => void>(() => {});
  const clearMarkerDraftRef = useRef<() => void>(() => {});

  const handleResetMeasurementBeforeMarkerEdit = useCallback(() => {
    clearMeasurementFieldsRef.current();
  }, []);
  const handleClearMarkerDraft = useCallback(() => {
    clearMarkerDraftRef.current();
  }, []);

  const marker = useMarkerWorkflow({
    tool,
    pendingMarker,
    selectedFeature,
    savedMarkerColor,
    markerFolders,
    bumpFeatures,
    setMsg,
    onResetMeasurementBeforeMarkerEdit: handleResetMeasurementBeforeMarkerEdit,
  });

  const measurement = useMeasurementWorkflow({
    measure,
    profile,
    editingFeatureId,
    activeUnsavedMeasurementId,
    selectedFeature,
    enableTerrainRouting,
    savedMeasurementColor,
    bumpFeatures,
    setMsg,
    onClearMarkerDraft: handleClearMarkerDraft,
  });

  clearMeasurementFieldsRef.current = measurement.clearTerrainAndFields;
  clearMarkerDraftRef.current = () => marker.setMarkerDraft(null);

  const escapeActionRef = useRef<(() => void) | null>(null);
  const deleteActionRef = useRef<(() => void) | null>(null);
  if (marker.markerDraft && tool !== "measure") {
    escapeActionRef.current = () => {
      marker.cancelMarkerEdit();
      focusMapViewport();
    };
    deleteActionRef.current = () => {
      void marker.deleteMarker().then((deleted) => {
        if (deleted) focusMapViewport();
      });
    };
  } else if (selectedFeature?.kind === "marker" && tool !== "measure") {
    escapeActionRef.current = () => {
      useMapStore.setState({ selectedFeature: null });
      focusMapViewport();
    };
    deleteActionRef.current = () => {
      void marker.deleteSelectedMarker().then((deleted) => {
        if (deleted) focusMapViewport();
      });
    };
  } else if (tool === "measure" || Boolean(selectedFeature) || Boolean(activeUnsavedMeasurementId)) {
    escapeActionRef.current = () => {
      measurement.closeMeasureTool();
      focusMapViewport();
    };
    deleteActionRef.current =
      measure && (editingFeatureId !== null || activeUnsavedMeasurementId !== null)
        ? () => {
            void measurement.deleteCurrentMeasurement().then((deleted) => {
              if (deleted && tool !== "measure") focusMapViewport();
            });
          }
        : null;
  } else {
    escapeActionRef.current = null;
    deleteActionRef.current = null;
  }

  const hasKeyboardTarget = Boolean(escapeActionRef.current || deleteActionRef.current);
  useEffect(() => {
    if (!hasKeyboardTarget) return;
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"], [data-shortcut-capturing="true"]')) return;
      if (event.key === "Escape") {
        const action = escapeActionRef.current;
        if (!action) return;
        event.preventDefault();
        action();
        return;
      }
      if (
        event.key === "Delete" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !shouldIgnoreDeleteForInput(event.target) &&
        !document.querySelector("[data-feature-context-menu]")
      ) {
        const action = deleteActionRef.current;
        if (!action) return;
        event.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [hasKeyboardTarget]);

  if (marker.markerDraft && tool !== "measure") {
    return (
      <MarkerEditor
        draft={marker.markerDraft}
        folders={markerFolders}
        opacity={overlayOpacity}
        busy={marker.markerBusy}
        message={msg}
        onChange={marker.setMarkerDraft}
        onSave={() => void marker.saveMarker()}
        onCancel={marker.cancelMarkerEdit}
        onDelete={() => void marker.deleteMarker()}
      />
    );
  }

  if (msg === "Tallennettu" && tool !== "measure" && !selectedFeature && !marker.markerDraft) {
    return (
      <div className="absolute left-1/2 top-16 sm:top-20 z-10 -translate-x-1/2 rounded-xl border border-emerald-200 bg-white/95 px-4 py-2 text-sm text-emerald-700 shadow-xl backdrop-blur-md dark:border-emerald-800 dark:bg-zinc-950/95 dark:text-emerald-400" style={{ opacity: overlayOpacity }}>
        {msg}
      </div>
    );
  }

  if (tool !== "measure" && !selectedFeature && !activeUnsavedMeasurementId) return null;

  if (selectedFeature?.kind === "marker" && tool !== "measure") {
    return (
      <SelectedMarkerBar
        selectedFeature={selectedFeature}
        savedMarkerColor={savedMarkerColor}
        overlayOpacity={overlayOpacity}
        onEdit={marker.editSelectedMarker}
        onDelete={() => void marker.deleteSelectedMarker()}
      />
    );
  }

  const msgIsError =
    msg.startsWith("Tallennus epäonnistui") ||
    msg.startsWith("Vienti epäonnistui") ||
    msg.startsWith("Maastoreititys epäonnistui");

  return (
    <div
      data-measure-tool="true"
      onKeyDown={(e) => handleContainerArrowKeyDown(e, { orientation: "horizontal", onEscape: () => { measurement.closeMeasureTool(); focusMapViewport(); } })}
      className="absolute left-2 right-2 top-16 sm:top-20 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs sm:text-sm text-slate-800 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 sm:left-1/2 sm:right-auto sm:max-w-[min(96vw,68rem)] sm:-translate-x-1/2 sm:gap-2.5 sm:px-4"
      style={{ opacity: overlayOpacity }}
    >
      <span className="whitespace-nowrap font-semibold text-slate-900 dark:text-white">
        {selectedFeature?.title ? `Mittaus: ${selectedFeature.title}` : "Mittaus"}
      </span>
      {!measure && (
        <>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-zinc-900">
            <button className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${measurementType !== "area" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"}`} onClick={() => measurement.chooseType("distance")}>Etäisyys</button>
            <button className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${measurementType === "area" ? "bg-blue-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"}`} onClick={() => measurement.chooseType("area")}>Pinta-ala</button>
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
          {measure.kind === "distance" && enableTerrainRouting && measurement.terrainStats && (
            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" title="Arvioitu nousu ennen ja jälkeen optimoinnin">
              Nousu: <b>{Math.round(measurement.terrainStats.originalClimbM)} m → {Math.round(measurement.terrainStats.routedClimbM)} m</b>
            </span>
          )}
          <input className="w-28 sm:w-36 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" placeholder="Mittauksen nimi" aria-label="Mittauksen nimi" value={measurement.title} onChange={(e) => measurement.setTitle(e.target.value)} />
          <input className="w-28 sm:w-40 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" placeholder="Kuvaus" aria-label="Mittauksen kuvaus" value={measurement.description} onChange={(e) => measurement.setDescription(e.target.value)} />
          <select
            className="max-w-36 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            aria-label="Mittauksen kansio"
            value={measurement.folderId}
            onChange={(e) => measurement.setFolderId(e.target.value)}
          >
            <option value="">Ei kansiota</option>
            {markerFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          <button disabled={measurement.savingMeasurement} className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-blue-700 disabled:opacity-60 transition" onClick={() => void measurement.saveMeasurement()}>
            <Save size={13} /> {editingFeatureId ? "Tallenna muutokset" : "Tallenna"}
          </button>
          <button className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-red-700 transition" onClick={() => void measurement.deleteCurrentMeasurement()} title="Poista mittaus">
            <Trash2 size={13} /> Poista
          </button>
          <button
            className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 transition"
            onClick={() => {
              if (!measure) return;
              void saveMeasurementFile(measure, measurement.title, measurement.description)
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
                <TerrainOptionsPopover
                  terrainRouting={measurement.terrainRouting}
                  terrainStage={measurement.terrainStage}
                  terrainOptionsOpen={measurement.terrainOptionsOpen}
                  onToggleOptions={() => measurement.setTerrainOptionsOpen((prev) => !prev)}
                  avoidSwamp={measurement.avoidSwamp}
                  onChangeAvoidSwamp={measurement.setAvoidSwamp}
                  avoidWater={measurement.avoidWater}
                  onChangeAvoidWater={measurement.setAvoidWater}
                  avoidStreams={measurement.avoidStreams}
                  onChangeAvoidStreams={measurement.setAvoidStreams}
                  terrainPreset={measurement.terrainPreset}
                  onChangePreset={measurement.setTerrainPreset}
                  hasOriginalGeojson={Boolean(measurement.originalGeojsonBeforeRoute)}
                  onRunTerrainRoute={() => void measurement.runTerrainRoute()}
                  onRestoreOriginal={measurement.restoreOriginalMeasurement}
                />
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
      <button onClick={measurement.closeMeasureTool} title="Sulje" aria-label="Sulje" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"><X size={16} /></button>
    </div>
  );
}
