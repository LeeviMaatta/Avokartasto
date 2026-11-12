import { useState } from "react";
import { Download, Save, X, Trash2 } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { addFeature, updateFeature } from "../../../services/tauriBridge";

export default function MeasureTool() {
  const { tool, measure, bumpFeatures, editingFeatureId } = useMapStore();
  const units = useMapStore((s) => s.settings.measurementUnits ?? "metric");
  const measurementType = useMapStore((s) => s.settings.measurementType ?? "distance");
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  if (tool !== "measure") return null;

  const save = async () => {
    if (!measure) return;
    try {
      const featureType = measure.kind === "area" ? "POLYGON" : "LINESTRING";
      if (editingFeatureId) {
        await updateFeature(editingFeatureId, title || "Mittaus", null, featureType, measure.geojson);
      } else {
        await addFeature(title || "Mittaus", null, featureType, measure.geojson);
      }
      bumpFeatures();
      useMapStore.setState({ editingFeatureId: null });
      setMsg("Tallennettu");
      setTitle("");
    } catch (e) {
      setMsg(String(e));
    }
  };

  const clearUnsaved = () => {
    window.dispatchEvent(new Event("clear-unsaved-measurements"));
    useMapStore.setState({ measure: null, profile: null, profileError: null });
  };

  const chooseType = (measurementType: "distance" | "area") => {
    window.dispatchEvent(new Event("clear-unsaved-measurements"));
    useMapStore.setState({ measure: null, profile: null, profileError: null });
    void useMapStore.getState().setSetting("measurementType", measurementType);
  };

  const exportMeasurement = () => {
    if (!measure) return;
    const blob = new Blob([JSON.stringify({
      type: "Feature",
      properties: { type: measure.kind },
      geometry: JSON.parse(measure.geojson),
    }, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mittaus-${new Date().toISOString().slice(0, 10)}.geojson`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="absolute left-2 right-2 top-20 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm text-slate-800 shadow-lg backdrop-blur sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:flex-nowrap sm:gap-3 sm:px-4">
      <span className="font-semibold">Mittaus</span>
      {!measure && (
        <>
          <button className={`rounded px-2 py-1 text-xs ${measurementType !== "area" ? "bg-[#1671a8] text-white" : "border border-slate-300"}`} onClick={() => chooseType("distance")}>Etäisyys</button>
          <button className={`rounded px-2 py-1 text-xs ${measurementType === "area" ? "bg-[#1671a8] text-white" : "border border-slate-300"}`} onClick={() => chooseType("area")}>Pinta-ala</button>
          <span className="text-gray-600">Piirrä pisteet, lopeta tuplaklikkauksella</span>
        </>
      )}
      {measure && (
        <>
          <span>
            {measure.kind === "area" ? (
              <>Pinta-ala: <b>{measure.length >= 1_000_000 ? `${(measure.length / 1_000_000).toFixed(2)} km²` : `${measure.length.toFixed(0)} m²`}</b></>
            ) : (
              units === "imperial"
                ? <>Pituus: <b>{measure.length >= 1609.344 ? `${(measure.length / 1609.344).toFixed(2)} mi` : `${(measure.length * 3.28084).toFixed(0)} ft`}</b></>
                : <>Pituus: <b>{measure.length >= 1000 ? `${(measure.length / 1000).toFixed(2)} km` : `${measure.length.toFixed(0)} m`}</b></>
            )}
          </span>
          <input className="w-28 rounded border dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-0.5 text-xs" placeholder="Nimi" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-white text-xs hover:bg-blue-700" onClick={save}>
            <Save size={14} /> Tallenna
          </button>
          <button className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-white text-xs hover:bg-red-700" onClick={clearUnsaved} title="Poista tallentamaton mittaus">
            <Trash2 size={14} /> Poista tallentamaton
          </button>
          <button className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-700" onClick={exportMeasurement} title="Vie GeoJSON-tiedostona">
            <Download size={14} /> Vie
          </button>
          {msg && <span className="text-green-600 dark:text-green-400 text-xs">{msg}</span>}
        </>
      )}
      <button onClick={() => useMapStore.setState({ tool: "none" })} title="Sulje"><X size={16} /></button>
    </div>
  );
}