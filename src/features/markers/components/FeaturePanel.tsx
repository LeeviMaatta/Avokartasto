import { useEffect, useRef } from "react";
import { Bookmark, ChevronDown, ChevronRight, Eye, EyeOff, Folder, FolderPlus, Pencil, Trash2 } from "lucide-react";
import type { MarkerFolder, MarkerPanelProps } from "../model/markerTypes";
import { focusFirstNavigable, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import { isTextInputTarget } from "../../settings/model/keyboardShortcuts";

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
  const panelRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const toggleOpenRef = useRef(onToggleOpen);
  toggleOpenRef.current = onToggleOpen;

  useEffect(() => {
    const onFocusMarkers = () => {
      if (!openRef.current) {
        toggleOpenRef.current();
      }
      window.requestAnimationFrame(() => focusFirstNavigable(panelRef.current));
    };
    window.addEventListener("kb-focus-markers", onFocusMarkers);
    return () => window.removeEventListener("kb-focus-markers", onFocusMarkers);
  }, []);

  const renderFeatureRow = (feature: typeof features[number]) => {
    const isHidden = hiddenFeatureIds.includes(feature.id);
    return (
      <div
        key={feature.id}
        data-kb-row="true"
        data-kb-feature-id={feature.id}
        className="group flex items-center justify-between gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800/60"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 transition-colors"
            title={isHidden ? "Näytä kartalla" : "Piilota kartalta"}
            aria-label={isHidden ? `Näytä ${feature.title} kartalla` : `Piilota ${feature.title} kartalta`}
            onClick={() => onToggleFeatureVisibility(feature.id)}
          >
            {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            className={`flex min-w-0 flex-1 items-center truncate pr-1 text-left text-xs ${
              isHidden ? "text-slate-400 dark:text-zinc-500" : "text-slate-700 dark:text-zinc-200"
            }`}
            onClick={() => onOpenFeature(feature)}
            title={feature.title}
          >
            <span className="truncate">{feature.title}</span>
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200 transition-colors opacity-60 group-hover:opacity-100"
            title={feature.feature_type === "POINT" ? "Muokkaa merkkiä" : "Muokkaa mittausta"}
            aria-label={`Muokkaa ${feature.title}`}
            onClick={() => onOpenFeature(feature)}
          >
            <Pencil size={13} />
          </button>
          <button
            className="shrink-0 rounded p-0.5 text-red-500/80 hover:bg-red-50 hover:text-red-600 dark:text-red-400/80 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors opacity-60 group-hover:opacity-100"
            title="Poista"
            aria-label={`Poista ${feature.title}`}
            onClick={() => onDeleteFeature(feature)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  };

  const ungroupedFeatures = features.filter((feature) => !feature.folder_id || !folders.some((folder) => folder.id === feature.folder_id));

  return (
    <div
      ref={panelRef}
      onKeyDown={(event) => {
        if (
          event.key === "Delete" &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey &&
          !isTextInputTarget(event.target) &&
          !document.querySelector('[aria-modal="true"], [data-shortcut-capturing="true"]')
        ) {
          const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          const featureRow = active?.closest<HTMLElement>("[data-kb-feature-id]");
          if (featureRow && panelRef.current?.contains(featureRow)) {
            const featureId = Number(featureRow.dataset.kbFeatureId);
            const feature = features.find((f) => f.id === featureId);
            if (feature) {
              event.preventDefault();
              event.stopPropagation();
              onDeleteFeature(feature);
              return;
            }
          }
          const folderRow = active?.closest<HTMLElement>("[data-kb-folder-id]");
          if (folderRow && panelRef.current?.contains(folderRow)) {
            const folderId = folderRow.dataset.kbFolderId;
            const folder = folders.find((f) => f.id === folderId);
            if (folder) {
              event.preventDefault();
              event.stopPropagation();
              onRemoveFolder(folder);
              return;
            }
          }
        }
        handleContainerArrowKeyDown(event);
      }}
      className="overflow-hidden rounded-lg bg-white/95 text-sm shadow-lg backdrop-blur dark:bg-zinc-950/95 dark:text-white"
    >
      <div data-kb-row="true" className="flex w-full items-center justify-between gap-1 px-3 py-2">
        <button aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left font-semibold" onClick={onToggleOpen}>
          <Bookmark size={16} /> <span className="truncate">Merkit ({features.length})</span>
        </button>
        <button
          type="button"
          onClick={onToggleFolderMenu}
          className="shrink-0 rounded p-1 text-[#1671a8] transition-colors hover:bg-slate-100 dark:hover:bg-zinc-800"
          title="Lisää kansio"
          aria-label="Lisää kansio"
        >
          <FolderPlus size={16} />
        </button>
      </div>
      {open && (
        <div className="max-h-[30vh] space-y-1 overflow-y-auto rounded-b-lg border-t border-slate-100 px-2 py-2 dark:border-zinc-800 sm:px-3">
          {folderMenuOpen && (
            <>
              <div className="fixed inset-0 z-15 cursor-default" onClick={onToggleFolderMenu} />
              <div className="absolute z-20 mt-[-0.25rem] w-48 rounded-xl border border-slate-200 bg-white/95 p-2.5 text-xs text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100">
                <input autoFocus className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-900" placeholder="Kansion nimi" value={folderDraft} onChange={(event) => onFolderDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { onAddFolder(); onToggleFolderMenu(); } else if (event.key === "Escape") { onToggleFolderMenu(); } }} />
                <button className="mt-1.5 w-full rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-blue-700" onClick={() => { onAddFolder(); onToggleFolderMenu(); }}>Lisää kansio</button>
              </div>
            </>
          )}
          {folders.map((folder: MarkerFolder) => {
            const folderFeatures = features.filter((feature) => feature.folder_id === folder.id);
            const isExpanded = expandedFolderIds.has(folder.id);
            return (
              <div key={folder.id} className="mt-1 rounded-md border border-slate-100 bg-slate-50/50 p-1 transition-colors dark:border-zinc-800/80 dark:bg-zinc-900/30">
                <div data-kb-row="true" data-kb-folder-id={folder.id} className="group/grp flex items-center justify-between gap-1 px-1 py-0.5 text-[11px] font-medium text-slate-600 dark:text-zinc-300">
                  <button className="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800" title={folder.visible ? "Piilota kansio kartalta" : "Näytä kansio kartalla"} onClick={() => onToggleFolder(folder)}>
                    {folder.visible ? <Eye size={13} /> : <EyeOff size={13} className="text-slate-400 dark:text-zinc-500" />}
                  </button>
                  <button className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-slate-200/70 dark:hover:bg-zinc-800" onClick={() => onToggleFolderExpanded(folder.id)} aria-expanded={isExpanded}>
                    {isExpanded ? <ChevronDown size={13} className="shrink-0 text-slate-400 dark:text-zinc-500" /> : <ChevronRight size={13} className="shrink-0 text-slate-400 dark:text-zinc-500" />}
                    <Folder size={13} className="shrink-0 text-amber-500" />
                    <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500">({folderFeatures.length})</span>
                  </button>
                  <button className="rounded p-1 text-slate-400 opacity-60 transition-opacity hover:bg-slate-200/70 hover:text-slate-700 group-hover/grp:opacity-100 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200" title="Muokkaa kansiota" aria-label={`Muokkaa kansiota ${folder.name}`} onClick={() => onRenameFolder(folder)}><Pencil size={12} /></button>
                  <button className="rounded p-1 text-red-500/80 opacity-60 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover/grp:opacity-100 dark:hover:bg-red-900/30" title="Poista kansio" aria-label={`Poista kansio ${folder.name}`} onClick={() => onRemoveFolder(folder)}><Trash2 size={12} /></button>
                </div>
                {isExpanded && (
                  <div className="ml-1.5 space-y-0.5 border-l border-slate-200 pl-2 pt-0.5 dark:border-zinc-700">
                    {folderFeatures.length === 0 ? <div className="px-2 py-1 text-[11px] italic text-slate-400 dark:text-zinc-500">Ei merkkejä tai mittauksia tässä kansiossa.</div> : folderFeatures.map(renderFeatureRow)}
                  </div>
                )}
              </div>
            );
          })}
          {ungroupedFeatures.length === 0 && folders.length === 0 && features.length === 0
            ? <div className="px-2 py-1 text-[11px] italic text-slate-400 dark:text-zinc-500">Ei tallennettuja merkkejä tai mittauksia.</div>
            : ungroupedFeatures.length > 0 && <div className="space-y-0.5 pt-0.5">{ungroupedFeatures.map(renderFeatureRow)}</div>}
        </div>
      )}
    </div>
  );
}
