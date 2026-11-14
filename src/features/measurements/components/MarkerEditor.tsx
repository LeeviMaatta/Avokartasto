import { MapPin, Save, Trash2, X } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { focusMapViewport, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";

export type MarkerFolder = { id: string; name: string; visible?: boolean };
export type MarkerDraft = {
  id?: number;
  title: string;
  description: string;
  color: string;
  folderId: string;
  geojson: string;
};

interface MarkerEditorProps {
  draft: MarkerDraft;
  folders: MarkerFolder[];
  opacity: number;
  busy: boolean;
  message: string;
  onChange: (draft: MarkerDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export default function MarkerEditor({ 
  draft, 
  folders, 
  opacity, 
  busy, 
  message, 
  onChange, 
  onSave, 
  onCancel,
  onDelete,
}: MarkerEditorProps) {
  const iconColor = useMapStore((s) =>
    draft.id !== undefined
      ? s.settings.savedMarkerColor || "#dc2626"
      : s.settings.unsavedMarkerColor || "#f97316",
  );
  return (
    <div 
      data-measure-tool="true"
      onKeyDown={(event) => handleContainerArrowKeyDown(event, { orientation: "horizontal", onEscape: () => { onCancel(); focusMapViewport(); } })}
      className="absolute left-2 right-2 top-16 z-20 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 text-xs text-slate-800 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100 sm:left-1/2 sm:right-auto sm:top-20 sm:max-w-[min(96vw,56rem)] sm:-translate-x-1/2 sm:gap-2.5 sm:px-4" 
      style={{ opacity }}
    >
      <span className="flex items-center gap-1.5 whitespace-nowrap font-semibold text-slate-900 dark:text-white sm:text-sm">
        <MapPin size={16} style={{ color: iconColor }} />
        <span>Merkki</span>
      </span>

      <input 
        autoFocus
        className="min-w-28 flex-1 sm:flex-initial sm:w-36 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" 
        placeholder="Nimi (valinnainen)" 
        aria-label="Merkin nimi" 
        value={draft.title} 
        onChange={(event) => onChange({ ...draft, title: event.target.value })} 
      />

      <input 
        className="min-w-32 flex-1 sm:flex-initial sm:w-44 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" 
        placeholder="Kuvaus" 
        aria-label="Merkin kuvaus" 
        value={draft.description} 
        onChange={(event) => onChange({ ...draft, description: event.target.value })} 
      />

      <select 
        className="max-w-36 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100" 
        aria-label="Merkin kansio" 
        value={draft.folderId} 
        onChange={(event) => onChange({ ...draft, folderId: event.target.value })}
      >
        <option value="">Ei kansiota</option>
        {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
      </select>

      <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
        <button 
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow hover:bg-blue-700 disabled:opacity-50 transition" 
          disabled={busy} 
          onClick={onSave}
        >
          <Save size={13} /> <span>Tallenna</span>
        </button>

        {onDelete && (
          <button 
            type="button"
            className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-red-700 transition" 
            onClick={onDelete}
            title="Poista merkki"
          >
            <Trash2 size={13} /> <span>Poista</span>
          </button>
        )}

        <button 
          className="flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 transition" 
          onClick={onCancel}
          title="Peruuta"
        >
          <X size={13} /> <span>Peruuta</span>
        </button>
      </div>

      {message && (
        <div className={`w-full text-center text-xs font-medium sm:w-auto ${message.startsWith("Tallennus epäonnistui") ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {message}
        </div>
      )}
    </div>
  );
}
