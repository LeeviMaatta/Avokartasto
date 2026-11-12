import type { LocalSource } from "../../../infrastructure/tauriBridge";

export type NewLayerSource = {
  name: string;
  base_path: string;
  pattern: string;
  role: LocalSource["role"];
  api_type: LocalSource["api_type"];
  tile_size: number;
  max_zoom: number;
  layer_name: string;
  style: string;
  attribution: string;
};

interface AddLayerModalProps {
  value: NewLayerSource;
  open: boolean;
  onChange: (value: NewLayerSource) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function AddLayerModal({ value, open, onChange, onClose, onSubmit }: AddLayerModalProps) {
  if (!open) return null;
  const update = <K extends keyof NewLayerSource>(key: K, next: NewLayerSource[K]) => onChange({ ...value, [key]: next });
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/30 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="max-h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-2xl sm:p-5">
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="text-lg font-semibold text-[#164b73]">Lisää karttataso</div>
          <button className="text-xl text-slate-400" onClick={onClose}>×</button>
        </div>
        <div className="grid gap-3">
          <label>Nimi<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={value.name} onChange={(e) => update("name", e.target.value)} /></label>
          <label>Osoite, kansio tai MBTiles-tiedosto<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={value.base_path} onChange={(e) => update("base_path", e.target.value)} /></label>
          <label>Laatan polku / URL-malli<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs" value={value.pattern} onChange={(e) => update("pattern", e.target.value)} /></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>API-tyyppi<select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={value.api_type} onChange={(e) => update("api_type", e.target.value as LocalSource["api_type"])}><option value="tile">Tile Map API</option><option value="wms">WMS API</option></select></label>
            <label>Käyttö<select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={value.role} onChange={(e) => update("role", e.target.value as LocalSource["role"])}><option value="basemap">Pohjakartta</option><option value="overlay">Päällys</option></select></label>
            <label>Laatan koko<input type="number" min="64" max="2048" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={value.tile_size} onChange={(e) => update("tile_size", Number(e.target.value))} /></label>
            <label>Maksimizo<input type="number" min="0" max="24" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={value.max_zoom} onChange={(e) => update("max_zoom", Number(e.target.value))} /></label>
          </div>
          <label>Layer / taso<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={value.layer_name} onChange={(e) => update("layer_name", e.target.value)} /></label>
          <label>Tyyli<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={value.style} onChange={(e) => update("style", e.target.value)} /></label>
          <label>Lähde / attribution<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={value.attribution} onChange={(e) => update("attribution", e.target.value)} /></label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded border border-slate-300 px-4 py-2" onClick={onClose}>Peruuta</button>
          <button className="rounded bg-[#1671a8] px-4 py-2 font-medium text-white disabled:opacity-50" disabled={!value.base_path.trim()} onClick={onSubmit}>Lisää</button>
        </div>
      </div>
    </div>
  );
}
