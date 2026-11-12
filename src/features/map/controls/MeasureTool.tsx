import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, Save, X, Trash2, MapPin, Pencil } from "lucide-react";
import GeoJSON from "ol/format/GeoJSON";
import Polygon from "ol/geom/Polygon";
import { getArea, getLength } from "ol/sphere";
import { useMapStore } from "../../../store/mapStore";
import { addFeature, deleteFeature, updateFeature, type UserFeature } from "../../../infrastructure/tauriBridge";
import { requestConfirmation } from "../../../app/confirmation";
import { exportMeasurement as saveMeasurementFile } from "../../measurements/domain/measurementExport";
import { formatArea, formatDistance } from "../../measurements/domain/measurementFormatting";
import MarkerEditor, { type MarkerDraft, type MarkerFolder } from "../../measurements/components/MarkerEditor";
import { resolveNearestPlaceName } from "../sources/reverseGeocode";

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
  const [msg, setMsg] = useState("");
  const [markerDraft, setMarkerDraft] = useState<MarkerDraft | null>(null);
  const [markerBusy, setMarkerBusy] = useState(false);

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
    if (selectedFeature?.kind === "measurement") setTitle(selectedFeature.title);
    else if (!selectedFeature) setTitle("");
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
      setTitle(feature.title);
      setMsg("");
      useMapStore.setState({
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
      <div className="absolute left-2 right-2 top-16 sm:top-20 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs sm:text-sm text-slate-800 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:flex-nowrap sm:px-4" style={{ opacity: overlayOpacity }}>
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
    if (!measure) return;
    setMsg("");
    try {
      const resolvedTitle =
        title.trim() ||
        (await resolveNearestPlaceName(measure.geojson, "Mittaus"));
      const featureType = measure.kind === "area" ? "POLYGON" : "LINESTRING";
      if (editingFeatureId) {
        await updateFeature(
          editingFeatureId,
          resolvedTitle,
          selectedFeature?.description ?? null,
          featureType,
          measure.geojson,
          selectedFeature?.folder_id ?? "",
          savedMeasurementColor,
        );
      } else {
        await addFeature(resolvedTitle, null, featureType, measure.geojson, "", savedMeasurementColor);
      }
      bumpFeatures();
      window.dispatchEvent(
        new CustomEvent("remove-measurement-feature", {
          detail: editingFeatureId !== null ? { savedId: editingFeatureId } : { unsavedId: activeUnsavedMeasurementId },
        }),
      );
      useMapStore.setState({ measure: null, profile: null, profileVisible: false, profileError: null, editingFeatureId: null, activeUnsavedMeasurementId: null, selectedFeature: null });
      setTitle("");
      setMsg("Tallennettu");
    } catch (error) {
      setMsg(`Tallennus epäonnistui: ${String(error)}`);
    }
  };

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
    setMsg("");
    setTitle("");
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

  const closeMeasureTool = () => {
    if (editingFeatureId !== null) {
      window.dispatchEvent(new CustomEvent("remove-measurement-feature", { detail: { savedId: editingFeatureId } }));
    }
    resetActiveMeasurementState(true);
  };

  const chooseType = (nextType: "distance" | "area") => {
    if (editingFeatureId !== null) {
      window.dispatchEvent(new CustomEvent("remove-measurement-feature", { detail: { savedId: editingFeatureId } }));
    }
    resetActiveMeasurementState(false);
    void useMapStore.getState().setSetting("measurementType", nextType);
  };

  return (
    <div className="absolute left-2 right-2 top-16 sm:top-20 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs sm:text-sm text-slate-800 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 sm:left-1/2 sm:right-auto sm:max-w-[min(96vw,56rem)] sm:-translate-x-1/2 sm:gap-2.5 sm:px-4" style={{ opacity: overlayOpacity }}>
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
          <input className="w-28 sm:w-36 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" placeholder="Mittauksen nimi" aria-label="Mittauksen nimi" value={title} onChange={(event) => setTitle(event.target.value)} />
          <button className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-blue-700 transition" onClick={() => void save()}>
            <Save size={13} /> {editingFeatureId ? "Tallenna muutokset" : "Tallenna"}
          </button>
          <button className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-red-700 transition" onClick={() => void deleteCurrentMeasurement()} title="Poista mittaus">
            <Trash2 size={13} /> Poista
          </button>
          <button
            className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 transition"
            onClick={() => {
              if (!measure) return;
              void saveMeasurementFile(measure, title)
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
            <button
              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${profileVisible ? "bg-blue-600 text-white shadow-xs" : "border border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"}`}
              onClick={() => useMapStore.setState({ profileVisible: !profileVisible })}
              disabled={!profile && !profileError}
              title="Näytä tai piilota korkeusprofiili"
            >
              <BarChart3 size={13} /> Korkeusprofiili
            </button>
          )}
        </>
      )}
      {msg && <span className={msg.startsWith("Tallennus epäonnistui") || msg.startsWith("Vienti epäonnistui") ? "text-red-600 dark:text-red-400 text-xs font-medium" : "text-emerald-600 dark:text-emerald-400 text-xs font-medium"}>{msg}</span>}
      <button onClick={closeMeasureTool} title="Sulje" aria-label="Sulje" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition"><X size={16} /></button>
    </div>
  );
}
