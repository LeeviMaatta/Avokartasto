import { MapPin, Save, X } from "lucide-react";

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
}

export default function MarkerEditor({ draft, folders, opacity, busy, message, onChange, onSave, onCancel }: MarkerEditorProps) {
  return (
    <div className="absolute left-2 right-2 top-20 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-sm text-slate-800 shadow-lg backdrop-blur sm:left-1/2 sm:right-auto sm:max-w-[min(96vw,52rem)] sm:-translate-x-1/2" style={{ opacity }}>
      <span className="flex items-center gap-1 whitespace-nowrap font-semibold"><MapPin size={16} /> {draft.id !== undefined ? "Muokkaa merkkiä" : "Merkki"}</span>
      <input className="w-32 rounded border border-slate-300 bg-white px-2 py-1 text-xs" placeholder="Nimi" aria-label="Merkin nimi" value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} />
      <input className="w-36 rounded border border-slate-300 bg-white px-2 py-1 text-xs" placeholder="Kuvaus" aria-label="Merkin kuvaus" value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} />
      <input type="color" className="h-7 w-8 cursor-pointer rounded border border-slate-300" title="Merkin väri" aria-label="Merkin väri" value={draft.color} onChange={(event) => onChange({ ...draft, color: event.target.value })} />
      <select className="max-w-32 rounded border border-slate-300 bg-white px-2 py-1 text-xs" aria-label="Merkin kansio" value={draft.folderId} onChange={(event) => onChange({ ...draft, folderId: event.target.value })}>
        <option value="">Ei kansiota</option>
        {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
      </select>
      <button className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50" disabled={!draft.title.trim() || busy} onClick={onSave}>
        <Save size={14} /> {draft.id !== undefined ? "Tallenna muutokset" : "Tallenna merkki"}
      </button>
      <button className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100" onClick={onCancel}>
        <X size={14} /> Peruuta
      </button>
      {message && <span className={message.startsWith("Tallennus epäonnistui") ? "text-red-600" : "text-green-600"}>{message}</span>}
    </div>
  );
}
