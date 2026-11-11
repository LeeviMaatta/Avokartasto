import { Layers, Bookmark } from "lucide-react";
import { useState, useEffect } from "react";
import { useMapStore } from "../../../store/mapStore";
import { BASEMAPS, OVERLAYS } from "../layers";
import { listFeatures, deleteFeature, type UserFeature } from "../../../services/tauriBridge";

export default function LayerSwitcher() {
  const [openLayers, setOpenLayers] = useState(true);
  const [openFeatures, setOpenFeatures] = useState(true);
  const { basemap, overlays, sources, settings, setBasemap, toggleOverlay, featuresVersion, bumpFeatures } = useMapStore();
  const [features, setFeatures] = useState<UserFeature[]>([]);

  const missing = (needs?: string) => needs && !settings[needs];

  useEffect(() => {
    listFeatures().then(setFeatures);
  }, [featuresVersion]);

  const allBasemaps = [
    ...BASEMAPS,
    ...sources.map((s) => ({ id: `local:${s.id}`, name: `📁 ${s.name}`, needs: undefined, note: "Paikallinen rasterikartta" }))
  ];

  return (
    <div className="absolute left-3 top-3 z-10 flex flex-col gap-2 w-64">
      {/* Karttatasot */}
      <div className="rounded-lg bg-white/95 dark:bg-gray-800/95 dark:text-white text-sm shadow-lg backdrop-blur">
        <button className="flex w-full items-center gap-2 px-3 py-2 font-semibold" onClick={() => setOpenLayers(!openLayers)}>
          <Layers size={16} /> Karttatasot
        </button>
        {openLayers && (
          <div className="max-h-[40vh] overflow-y-auto border-t dark:border-gray-700 px-3 py-2">
            <div className="mb-1 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Taustakartta</div>
            {allBasemaps.map((b) => (
              <label key={b.id} className={`flex items-center gap-2 py-0.5 cursor-pointer ${missing(b.needs) ? "opacity-40" : ""}`} title={missing(b.needs) ? "Lisää API-avain asetuksissa" : b.note}>
                <input type="radio" name="base" checked={basemap === b.id} onChange={() => setBasemap(b.id)} />
                <span>{b.name}</span>
              </label>
            ))}
            <div className="mb-1 mt-3 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Päällykset</div>
            {OVERLAYS.map((o) => (
              <label key={o.id} className={`flex items-center gap-2 py-0.5 cursor-pointer ${missing(o.needs) ? "opacity-40" : ""}`} title={missing(o.needs) ? "Lisää API-avain asetuksissa" : o.note}>
                <input type="checkbox" checked={overlays.includes(o.id)} onChange={() => toggleOverlay(o.id)} />
                <span>{o.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Tallennetut mittaukset / merkinnät */}
      <div className="rounded-lg bg-white/95 dark:bg-gray-800/95 dark:text-white text-sm shadow-lg backdrop-blur">
        <button className="flex w-full items-center gap-2 px-3 py-2 font-semibold" onClick={() => setOpenFeatures(!openFeatures)}>
          <Bookmark size={16} /> Tallennetut mittaukset ({features.length})
        </button>
        {openFeatures && (
          <div className="max-h-[30vh] overflow-y-auto border-t dark:border-gray-700 px-3 py-2 space-y-1">
            {features.length === 0 ? (
              <div className="text-xs text-gray-400 py-1">Ei tallennettuja mittauksia.</div>
            ) : (
              features.map((f) => (
                <div key={f.id} className="flex items-center justify-between text-xs py-1 border-b dark:border-gray-700 last:border-none">
                  <span className="truncate pr-2 font-medium">{f.title}</span>
                  <button 
                    className="text-red-500 hover:text-red-700 text-[10px]"
                    onClick={async () => {
                      if (confirm(`Haluatko varmasti poistaa merkinnän "${f.title}"?`)) {
                        await deleteFeature(f.id);
                        bumpFeatures();
                      }
                    }}
                  >
                    Poista
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}