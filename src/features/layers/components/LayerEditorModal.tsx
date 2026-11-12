import { useEffect } from "react";
import type { LocalSource } from "../../../infrastructure/tauriBridge";
import type { LayerViewDraft } from "../model/layerViewTypes";

interface LayerEditorModalProps {
  editDraft: LocalSource | null;
  editLayer: { id: string; name: string; overlay: boolean } | null;
  selectedBasemap: string;
  viewDraft: LayerViewDraft;
  apiDraft: Record<string, string>;
  onSelectedBasemapChange: (value: string) => void;
  onEditDraftChange: (value: LocalSource) => void;
  onViewDraftChange: (value: LayerViewDraft) => void;
  onApiDraftChange: (value: Record<string, string>) => void;
  onClose: () => void;
  onSaveSource: () => void;
  onSaveLayer: () => void;
}

export default function LayerEditorModal({
  editDraft,
  editLayer,
  selectedBasemap,
  viewDraft,
  apiDraft,
  onSelectedBasemapChange,
  onEditDraftChange,
  onViewDraftChange,
  onApiDraftChange,
  onClose,
  onSaveSource,
  onSaveLayer,
}: LayerEditorModalProps) {
  useEffect(() => {
    if (!editDraft && !editLayer) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editDraft, editLayer, onClose]);

  if (!editDraft && !editLayer) return null;

  const isDefault = Boolean(editLayer || editDraft?.is_default);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-sm text-slate-800 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
        <div className="overflow-x-hidden overflow-y-auto p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-[#164b73] dark:text-sky-400">Muokkaa karttatasoa</span>
              {isDefault ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                  Oletustaso
                </span>
              ) : (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:bg-blue-950/60 dark:text-blue-300">
                  Tuotu taso
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">
              {isDefault
                ? "Sisäänrakennettu oletuskarttataso."
                : "Käyttäjän lisäämä tai tiedostosta tuotu karttataso."}
            </div>
          </div>
          <button className="rounded p-1 text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-white" onClick={onClose} title="Sulje (Esc)">×</button>
        </div>
        <div className="grid gap-3">
          {editLayer && (
            <>
              {!editLayer.overlay && <label>Taustakartta
                <select className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" value={selectedBasemap} onChange={(e) => onSelectedBasemapChange(e.target.value)}>
                  <option value="osm">OpenStreetMap</option>
                  <option value="g-sat">Google Satelliitti</option>
                  <option value="g-hyb">Google Hybridi</option>
                  <option value="g-ter">Google Maasto</option>
                  <option value="mml-maasto">MML Maastokartta</option>
                  <option value="mml-tausta">MML Taustakartta</option>
                </select>
              </label>}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="mb-2 font-semibold text-[#164b73] dark:text-sky-400">Karttatason API-asetukset</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label>API-tyyppi<input disabled className="mt-1 w-full rounded border border-slate-300 bg-slate-100 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-800" value={editLayer.id.includes("mml") || editLayer.id.includes("lantmateriet") ? "WMTS API" : "Tile Map API"} /></label>
                  <label>Laatan koko<input disabled className="mt-1 w-full rounded border border-slate-300 bg-slate-100 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-800" value="256" /></label>
                  <label>Layer / taso<input disabled className="mt-1 w-full rounded border border-slate-300 bg-slate-100 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-800" value={editLayer.name} /></label>
                  <label>Maksimizoom<input disabled className="mt-1 w-full rounded border border-slate-300 bg-slate-100 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-800" value="Lähdekoodissa määritelty" /></label>
                </div>
                <div className="mt-2 text-[11px] text-slate-500 dark:text-zinc-400">Sisäänrakennetun tason osoite ja tekniset parametrit tulevat lähdekoodin karttakatalogista.</div>
              </div>
            </>
          )}
          {editDraft && <>
            <label>Karttatason nimi<input className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" value={editDraft.name} onChange={(e) => onEditDraftChange({ ...editDraft, name: e.target.value })} /></label>
            <label>{editDraft.api_type === "local_tile" ? "Kansio tai MBTiles-tiedosto" : "Osoite (URL)"}<input className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" value={editDraft.api_type === "local_tile" ? editDraft.base_path : editDraft.url} placeholder={editDraft.api_type === "local_tile" ? "esim. C:\\kartat\\tiilet" : "https://.../{z}/{x}/{y}.png"} onChange={(e) => onEditDraftChange(editDraft.api_type === "local_tile" ? { ...editDraft, base_path: e.target.value } : { ...editDraft, url: e.target.value })} /></label>
            {editDraft.api_type === "local_tile" && (
              <label>Laatan polku<input className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900" value={editDraft.pattern} onChange={(e) => onEditDraftChange({ ...editDraft, pattern: e.target.value })} /></label>
            )}
            <label>Rajapinnan tyyppi<select className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" value={editDraft.api_type} onChange={(e) => onEditDraftChange({ ...editDraft, api_type: e.target.value as LocalSource["api_type"] })}><option value="local_tile">Local tile</option><option value="xyz">Tile Map API</option><option value="wmts">WMTS API</option><option value="wms">WMS API</option><option value="vector_tile">Vector tile</option><option value="geojson">GeoJSON</option><option value="gpx">GPX</option><option value="kml">KML</option><option value="wfs">WFS</option><option value="img">IMG / raster image</option></select></label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label>Laatan koko<input type="number" min="64" max="2048" className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" value={editDraft.tile_size} onChange={(e) => onEditDraftChange({ ...editDraft, tile_size: Number(e.target.value) })} /></label>
              <label>Layer / taso<input className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" value={editDraft.layer_name} onChange={(e) => onEditDraftChange({ ...editDraft, layer_name: e.target.value })} /></label>
            </div>
            <label>Tyyli<input className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" value={editDraft.style} onChange={(e) => onEditDraftChange({ ...editDraft, style: e.target.value })} /></label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label>Tason käyttö<select className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" value={editDraft.role} onChange={(e) => onEditDraftChange({ ...editDraft, role: e.target.value as LocalSource["role"] })}><option value="basemap">Pohjakartta</option><option value="overlay">Päällys</option></select></label>
              <label>Maksimizoom<input type="number" min="0" max="24" className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" value={editDraft.max_zoom} onChange={(e) => onEditDraftChange({ ...editDraft, max_zoom: Number(e.target.value) })} /></label>
            </div>
            <label>Läpinäkyvyys: {Math.round(editDraft.opacity * 100)}%
              <input type="range" min="0" max="1" step="0.05" className="mt-2 w-full accent-[#1671a8]" value={editDraft.opacity} onChange={(e) => onEditDraftChange({ ...editDraft, opacity: Number(e.target.value) })} />
            </label>
            <label>Tekijänoikeus / lähde<input className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" value={editDraft.attribution} onChange={(e) => onEditDraftChange({ ...editDraft, attribution: e.target.value })} /></label>
          </>}
          <div className="border-t border-slate-200 pt-3 dark:border-zinc-800">
            <div className="mb-2 font-semibold text-[#164b73] dark:text-sky-400">Zoomaus ja suurennus</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label>Zoom offset<select className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" value={viewDraft.zoomOffset} onChange={(e) => onViewDraftChange({ ...viewDraft, zoomOffset: Number(e.target.value) })}>{[-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((value) => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}</select></label>
              <label>Suurennus<select className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" value={viewDraft.magnification} onChange={(e) => onViewDraftChange({ ...viewDraft, magnification: Number(e.target.value) })}><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option></select></label>
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400">Positiivinen offset siirtää aineiston alemmalta zoomilta ylemmälle karttazoomille.</div>
          </div>
          <div className="border-t border-slate-200 pt-3 dark:border-zinc-800">
            <div className="mb-2 font-semibold text-[#164b73] dark:text-sky-400">Rajapinta-asetukset</div>
            {[
              ["mmlKey", "Maanmittauslaitoksen API-avain"],
              ["lantmaterietUsername", "Lantmäteriet käyttäjätunnus"],
              ["lantmaterietPassword", "Lantmäteriet salasana"],
              ["owmKey", "OpenWeatherMap API-avain"],
              ["copernicusInstanceId", "Copernicus Instance ID"],
            ].map(([key, label]) => (
              <label key={key} className="mb-2 block text-xs">{label}
                <input type={key.toLowerCase().includes("password") || key.toLowerCase().includes("key") ? "password" : "text"} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" value={apiDraft[key] ?? ""} onChange={(e) => onApiDraftChange({ ...apiDraft, [key]: e.target.value })} />
              </label>
            ))}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded border border-slate-300 px-4 py-2 dark:border-zinc-700" onClick={onClose}>Peruuta</button>
          <button className="rounded bg-[#1671a8] px-4 py-2 font-medium text-white hover:bg-[#125d8c]" onClick={editDraft ? onSaveSource : onSaveLayer}>Tallenna</button>
        </div>
        </div>
      </div>
    </div>
  );
}
