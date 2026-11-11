import { useState } from "react";
import { Save, X, Trash2 } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { addFeature } from "../../../services/tauriBridge";

export default function MeasureTool() {
  const { tool, measure, bumpFeatures } = useMapStore();
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState("");
  if (tool !== "measure") return null;

  const save = async () => {
    if (!measure) return;
    try {
      await addFeature(title || "Mittaus", null, "LINESTRING", measure.geojson);
      bumpFeatures();
      setMsg("Tallennettu");
      setTitle("");
    } catch (e) {
      setMsg(String(e));
    }
  };

  const clearUnsaved = () => {
    useMapStore.setState({ measure: null, profile: null, profileError: null });
  };

  return (
    <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-white/95 dark:bg-gray-800/95 dark:text-white px-4 py-2 text-sm shadow-lg backdrop-blur">
      <span className="font-semibold">Mittaus</span>
      {!measure && <span className="text-gray-600 dark:text-gray-300">Piirrä reitti klikkaamalla, lopeta tuplaklikkauksella</span>}
      {measure && (
        <>
          <span>
            Pituus: <b>{measure.length >= 1000 ? `${(measure.length / 1000).toFixed(2)} km` : `${measure.length.toFixed(0)} m`}</b>
          </span>
          <input className="w-28 rounded border dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-0.5 text-xs" placeholder="Nimi" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-white text-xs hover:bg-blue-700" onClick={save}>
            <Save size={14} /> Tallenna
          </button>
          <button className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-white text-xs hover:bg-red-700" onClick={clearUnsaved} title="Poista tallentamaton mittaus">
            <Trash2 size={14} /> Poista tallentamaton
          </button>
          {msg && <span className="text-green-600 dark:text-green-400 text-xs">{msg}</span>}
        </>
      )}
      <button onClick={() => useMapStore.setState({ tool: "none" })} title="Sulje"><X size={16} /></button>
    </div>
  );
}