import { Bookmark, ChevronDown, ChevronRight, Eye, EyeOff, Folder, FolderPlus, Pencil, Trash2 } from "lucide-react";
import type { MarkerFolder, MarkerPanelProps } from "../model/markerTypes";

export default function FeaturePanel({
  features,
  folders,
  open,
  folderMenuOpen,
  expandedFolderIds,
  folderDraft,
  hiddenFeatureIds,
  onToggleOpen,
  onToggleFolderMenu,
  onFolderDraftChange,
  onAddFolder,
  onToggleFolder,
  onToggleFolderExpanded,
  onRenameFolder,
  onRemoveFolder,
  onToggleFeatureVisibility,
  onOpenFeature,
  onDeleteFeature,
}: MarkerPanelProps) {
  const renderFeatureRow = (feature: typeof features[number]) => (
    <div key={feature.id} className="flex items-center gap-1 border-b py-1 text-xs last:border-none dark:border-gray-700">
      <button
        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-slate-100 hover:text-gray-700 dark:hover:bg-gray-700"
        title={hiddenFeatureIds.includes(feature.id) ? "Näytä kartalla" : "Piilota kartalta"}
        aria-label={hiddenFeatureIds.includes(feature.id) ? `Näytä ${feature.title} kartalla` : `Piilota ${feature.title} kartalta`}
        onClick={() => onToggleFeatureVisibility(feature.id)}
      >
        {hiddenFeatureIds.includes(feature.id) ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button className="flex min-w-0 flex-1 items-center truncate pr-2 text-left font-medium" onClick={() => onOpenFeature(feature)} title={feature.title}>
        <span className="truncate">{feature.title}</span>
      </button>
      <button className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-slate-100 hover:text-gray-700 dark:hover:bg-gray-700" title={feature.feature_type === "POINT" ? "Muokkaa merkkiä" : "Muokkaa mittausta"} aria-label={`Muokkaa ${feature.title}`} onClick={() => onOpenFeature(feature)}>
        <Pencil size={13} />
      </button>
      <button
        className="shrink-0 rounded p-0.5 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30"
        title="Poista"
        aria-label={`Poista ${feature.title}`}
        onClick={() => onDeleteFeature(feature)}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  const ungroupedFeatures = features.filter((feature) => !feature.folder_id || !folders.some((folder) => folder.id === feature.folder_id));

  return (
    <div className="rounded-lg bg-white/95 text-sm shadow-lg backdrop-blur dark:bg-zinc-950/95 dark:text-white">
      <button className="flex w-full items-center gap-2 px-3 py-2 font-semibold" onClick={onToggleOpen}>
        <Bookmark size={16} /> <span className="flex-1 text-left">Merkit ({features.length})</span>
        <span onClick={(event) => { event.stopPropagation(); onToggleFolderMenu(); }} className="rounded p-1 text-slate-600 hover:bg-slate-100 dark:text-gray-200 dark:hover:bg-gray-700" title="Lisää kansio"><FolderPlus size={15} /></span>
      </button>
      {open && (
        <div className="max-h-[30vh] space-y-1 overflow-y-auto border-t px-3 py-2 dark:border-gray-700">
          {folderMenuOpen && (
            <div className="absolute z-20 mt-[-0.25rem] w-48 rounded border border-slate-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-950">
              <input autoFocus className="w-full rounded border border-slate-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900" placeholder="Kansion nimi" value={folderDraft} onChange={(event) => onFolderDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { onAddFolder(); onToggleFolderMenu(); } }} />
              <button className="mt-1 w-full rounded bg-[#1671a8] px-2 py-1 text-xs text-white" onClick={() => { onAddFolder(); onToggleFolderMenu(); }}>Lisää kansio</button>
            </div>
          )}
          {folders.map((folder: MarkerFolder) => {
            const folderFeatures = features.filter((feature) => feature.folder_id === folder.id);
            const isExpanded = expandedFolderIds.has(folder.id);
            return (
              <div key={folder.id} className="rounded border-b border-slate-100 last:border-none dark:border-gray-700">
                <div className="flex items-center gap-1 py-1 text-xs">
                  <button className="rounded p-0.5 hover:bg-slate-100 dark:hover:bg-gray-700" title={folder.visible ? "Piilota kansio kartalta" : "Näytä kansio kartalla"} onClick={() => onToggleFolder(folder)}>
                    {folder.visible ? <Eye size={14} /> : <EyeOff size={14} className="text-gray-400" />}
                  </button>
                  <button className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-slate-100 dark:hover:bg-gray-700" onClick={() => onToggleFolderExpanded(folder.id)} aria-expanded={isExpanded}>
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <Folder size={14} className="shrink-0 text-amber-500" />
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    <span className="text-[10px] text-gray-400">{folderFeatures.length}</span>
                  </button>
                  <button className="rounded p-1 text-gray-400 hover:bg-slate-100 hover:text-gray-700 dark:hover:bg-gray-700" title="Muokkaa kansiota" aria-label={`Muokkaa kansiota ${folder.name}`} onClick={() => onRenameFolder(folder)}><Pencil size={13} /></button>
                  <button className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/30" title="Poista kansio" aria-label={`Poista kansio ${folder.name}`} onClick={() => onRemoveFolder(folder)}><Trash2 size={13} /></button>
                </div>
                {isExpanded && (
                  <div className="ml-7 border-l border-slate-200 pl-2 dark:border-gray-600">
                    {folderFeatures.length === 0 ? <div className="py-1 text-[11px] text-gray-400">Ei merkkejä tässä kansiossa.</div> : folderFeatures.map(renderFeatureRow)}
                  </div>
                )}
              </div>
            );
          })}
          {ungroupedFeatures.length === 0 && folders.length === 0 && features.length === 0
            ? <div className="py-1 text-xs text-gray-400">Ei tallennettuja merkkejä tai mittauksia.</div>
            : ungroupedFeatures.map(renderFeatureRow)}
        </div>
      )}
    </div>
  );
}
