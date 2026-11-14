import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { COPERNICUS_LAYER_PRESETS, type CopernicusLayerInfo } from "../../services/copernicusParams";

interface CopernicusLayerPickerProps {
  layerPickerOpen: boolean;
  onToggleOpen: () => void;
  layerName: string;
  instanceLayers: CopernicusLayerInfo[];
  capabilitiesError: string | null;
  onSelectLayer: (layerName: string) => void;
}

export function CopernicusLayerPicker({
  layerPickerOpen,
  onToggleOpen,
  layerName,
  instanceLayers,
  capabilitiesError,
  onSelectLayer,
}: CopernicusLayerPickerProps) {
  return (
    <div className="space-y-1.5 border-t border-slate-100 pt-2 dark:border-zinc-800">
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-center justify-between gap-2 text-left font-medium text-slate-700 hover:text-slate-900 dark:text-zinc-200 dark:hover:text-white"
        aria-expanded={layerPickerOpen}
      >
        <span className="flex items-center gap-1.5">
          <Layers size={13} /> Kuvatyyppi (WMS-kerros)
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-zinc-400">
          <span className="max-w-28 truncate font-mono">{layerName}</span>
          {layerPickerOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {layerPickerOpen && (
        <>
          {capabilitiesError && (
            <div className="text-[11px] text-amber-600 dark:text-amber-400">
              Kerroslistan haku epäonnistui: {capabilitiesError}
            </div>
          )}
          <div className="flex flex-wrap gap-1">
            {(instanceLayers.length > 0
              ? instanceLayers.map((l) => ({ id: l.name, label: l.title }))
              : COPERNICUS_LAYER_PRESETS
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onSelectLayer(preset.id)}
                title={preset.id}
                className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                  layerName === preset.id
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={layerName}
            onChange={(e) => onSelectLayer(e.target.value)}
            placeholder="WMS-kerroksen nimi (esim. TRUE-COLOR)"
            aria-label="Copernicus WMS-kerroksen nimi"
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-[11px] text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </>
      )}
    </div>
  );
}
