import { X } from "lucide-react";
import type { MarkerFolder } from "../model/markerTypes";

interface FolderEditorProps {
  folder: MarkerFolder | null;
  name: string;
  onNameChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export default function FolderEditor({ folder, name, onNameChange, onClose, onSave }: FolderEditorProps) {
  if (!folder) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 dark:border-zinc-800">
          <h2 className="font-semibold">Muokkaa kansiota</h2>
          <button className="text-slate-400 hover:text-slate-700 dark:hover:text-white" onClick={onClose} aria-label="Sulje"><X size={18} /></button>
        </div>
        <input autoFocus className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900" value={name} onChange={(event) => onNameChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSave(); }} />
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-zinc-700 dark:hover:bg-zinc-800" onClick={onClose}>Peruuta</button>
          <button className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700" onClick={onSave}>Tallenna</button>
        </div>
      </div>
    </div>
  );
}
