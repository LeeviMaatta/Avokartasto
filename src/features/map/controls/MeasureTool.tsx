import { useEffect, useMemo, useState } from "react";
import { BarChart3, Download, Save, X, Trash2, MapPin, Pencil } from "lucide-react";
import GeoJSON from "ol/format/GeoJSON";
import Polygon from "ol/geom/Polygon";
import { getArea, getLength } from "ol/sphere";
import { useMapStore } from "../../../store/mapStore";
import { addFeature, updateFeature, type UserFeature } from "../../../infrastructure/tauriBridge";
import { exportMeasurement as saveMeasurementFile } from "../../measurements/domain/measurementExport";
import { formatArea, formatDistance } from "../../measurements/domain/measurementFormatting";
import MarkerEditor, { type MarkerDraft, type MarkerFolder } from "../../measurements/components/MarkerEditor";

const emptyMarkerDraft = (geojson: string, folderId = ""): MarkerDraft => ({
  title: "",
  description: "",
  color: "#dc2626",
  folderId,
  geojson,
});

export default function MeasureTool() {
  const { tool, measure, bumpFeatures, editingFeatureId } = useMapStore();
  const units = useMapStore((s) => s.settings.measurementUnits ?? "metric");
  const measurementType = useMapStore((s) => s.settings.measurementType ?? "distance");
  const settings = useMapStore((s) => s.settings);
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
      const parsed: unknown = JSON.parse(settings.markerFolders ?? "[]");
      return Array.isArray(parsed)
        ? parsed.filter((folder): folder is MarkerFolder => Boolean(folder) && typeof folder.id === "string" && typeof folder.name === "string")
        : [];
    } catch {
      return [];
    }
  }, [settings.markerFolders]);

  useEffect(() => {
    if (selectedFeature?.kind === "measurement") setTitle(selectedFeature.title);
  }, [selectedFeature]);

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
    if (!pendingMarker || tool === "measure" || markerDraft) return;
    setMarkerDraft(emptyMarkerDraft(
      JSON.stringify({ type: "Point", coordinates: pendingMarker }),
      markerFolders[0]?.id ?? "",
    ));
    setMsg("");
  }, [pendingMarker, tool, markerDraft, markerFolders]);

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
        tool: "measure",
        editingFeatureId: feature.id,
        measure: { length, geojson: feature.geojson, kind },
        profile: null,
        profileVisible: false,
        profileError: null,
        selectedFeature: { id: feature.id, kind: "measurement", title: feature.title },
      });
    };
    window.addEventListener("open-measurement-editor", handleEditMeasurement);
    return () => window.removeEventListener("open-measurement-editor", handleEditMeasurement);
  }, []);

  const saveMarker = async () => {
    if (!markerDraft || !markerDraft.title.trim() || markerBusy) return;
    setMarkerBusy(true);
    setMsg("");
    try {
      const args = [
        markerDraft.title.trim(),
        markerDraft.description.trim() || null,
        "POINT",
        markerDraft.geojson,
        markerDraft.folderId,
        markerDraft.color,
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

  if (markerDraft && tool !== "measure") {
    return <MarkerEditor draft={markerDraft} folders={markerFolders} opacity={overlayOpacity} busy={markerBusy} message={msg} onChange={setMarkerDraft} onSave={() => void saveMarker()} onCancel={cancelMarkerEdit} />;
  }

  if (msg === "Tallennettu" && tool !== "measure" && !selectedFeature && !markerDraft) {
    return (
      <div className="absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-xl border border-emerald-200 bg-white/95 px-4 py-2 text-sm text-emerald-700 shadow-lg backdrop-blur" style={{ opacity: overlayOpacity }}>
        {msg}
      </div>
    );
  }

  if (tool !== "measure" && !selectedFeature) return null;

  if (selectedFeature?.kind === "marker" && tool !== "measure") {
    return (
      <div className="absolute left-2 right-2 top-20 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm text-slate-800 shadow-lg backdrop-blur sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:flex-nowrap sm:px-4" style={{ opacity: overlayOpacity }}>
        <span className="flex items-center gap-1 font-semibold"><MapPin size={16} /> Merkki</span>
        <span className="max-w-48 truncate">{selectedFeature.title}</span>
        <button className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100" onClick={() => {
          setMarkerDraft({
            id: selectedFeature.id,
            title: selectedFeature.title,
            description: selectedFeature.description ?? "",
            color: selectedFeature.color || "#dc2626",
            folderId: selectedFeature.folder_id ?? "",
            geojson: selectedFeature.geojson ?? "",
          });
        }}><Pencil size={13} /> Muokkaa</button>
        <button onClick={() => useMapStore.setState({ selectedFeature: null })} title="Sulje" aria-label="Sulje"><X size={16} /></button>
      </div>
    );
  }

  const save = async () => {
    if (!measure) return;
    setMsg("");
    try {
      const featureType = measure.kind === "area" ? "POLYGON" : "LINESTRING";
      if (editingFeatureId) {
        await updateFeature(editingFeatureId, title || "Mittaus", null, featureType, measure.geojson);
      } else {
        await addFeature(title || "Mittaus", null, featureType, measure.geojson);
      }
      bumpFeatures();
      window.dispatchEvent(new Event("clear-unsaved-measurements"));
      useMapStore.setState({ measure: null, profile: null, profileVisible: false, profileError: null, editingFeatureId: null, selectedFeature: null });
      setTitle("");
    } catch (error) {
      setMsg(`Tallennus epäonnistui: ${String(error)}`);
    }
  };

  const clearUnsaved = () => {
    window.dispatchEvent(new Event("clear-unsaved-measurements"));
    useMapStore.setState({ measure: null, profile: null, profileVisible: false, profileError: null, editingFeatureId: null });
    setMsg("");
    setTitle("");
  };

  const chooseType = (nextType: "distance" | "area") => {
    window.dispatchEvent(new Event("clear-unsaved-measurements"));
    useMapStore.setState({ measure: null, profile: null, profileVisible: false, profileError: null, editingFeatureId: null });
    setMsg("");
    setTitle("");
    void useMapStore.getState().setSetting("measurementType", nextType);
  };

  return (
    <div className="absolute left-2 right-2 top-20 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm text-slate-800 shadow-lg backdrop-blur sm:left-1/2 sm:right-auto sm:max-w-[min(96vw,56rem)] sm:-translate-x-1/2 sm:gap-3 sm:px-4" style={{ opacity: overlayOpacity }}>
      <span className="whitespace-nowrap font-semibold">{selectedFeature?.title ? `Mittaus: ${selectedFeature.title}` : "Mittaus"}</span>
      {!measure && (
        <>
          <button className={`rounded px-2 py-1 text-xs ${measurementType !== "area" ? "bg-[#1671a8] text-white" : "border border-slate-300"}`} onClick={() => chooseType("distance")}>Etäisyys</button>
          <button className={`rounded px-2 py-1 text-xs ${measurementType === "area" ? "bg-[#1671a8] text-white" : "border border-slate-300"}`} onClick={() => chooseType("area")}>Pinta-ala</button>
          <span className="text-xs text-gray-600">Piirrä pisteet, lopeta tuplaklikkauksella</span>
        </>
      )}
      {measure && (
        <>
          <span>
            {measure.kind === "area"
              ? <>Pinta-ala: <b>{formatArea(measure.length)}</b></>
              : <>Pituus: <b>{formatDistance(measure.length, units)}</b></>}
          </span>
          <input className="w-28 rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-700" placeholder="Nimi" aria-label="Mittauksen nimi" value={title} onChange={(event) => setTitle(event.target.value)} />
          <button className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700" onClick={() => void save()}>
            <Save size={14} /> {editingFeatureId ? "Tallenna muutokset" : "Tallenna"}
          </button>
          <button className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700" onClick={clearUnsaved} title="Poista mittaus">
            <Trash2 size={14} /> Poista
          </button>
          <button className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => measure && saveMeasurementFile(measure)} title="Vie GeoJSON-tiedostona">
            <Download size={14} /> Vie
          </button>
          {measure.kind === "distance" && (
            <button
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${profileVisible ? "bg-[#1671a8] text-white" : "border border-slate-300 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
              onClick={() => useMapStore.setState({ profileVisible: !profileVisible })}
              disabled={!profile && !profileError}
              title="Näytä tai piilota korkeusprofiili"
            >
              <BarChart3 size={14} /> Korkeusprofiili
            </button>
          )}
        </>
      )}
      {msg && <span className={msg.startsWith("Tallennus epäonnistui") ? "text-red-600 dark:text-red-400 text-xs" : "text-green-600 dark:text-green-400 text-xs"}>{msg}</span>}
      <button onClick={() => useMapStore.setState({ tool: "none", selectedFeature: null })} title="Sulje" aria-label="Sulje"><X size={16} /></button>
    </div>
  );
}
