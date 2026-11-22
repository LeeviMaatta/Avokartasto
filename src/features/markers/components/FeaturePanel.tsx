import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Bookmark, ChevronDown, ChevronRight, Eye, EyeOff, Folder, GripVertical, MoreHorizontal } from "lucide-react";
import type { UserFeature } from "../../../infrastructure/tauri";
import type { FeatureFolderMenuState, FeatureItemMenuState, MarkerFolder, MarkerPanelProps } from "../model/markerTypes";
import { focusFirstNavigable, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import { isTextInputTarget } from "../../settings/model/keyboardShortcuts";
import { FeatureRow } from "./FeatureRow";
import { FeatureItemContextMenu } from "./FeatureItemContextMenu";
import { FeatureFolderContextMenu } from "./FeatureFolderContextMenu";

export default function FeaturePanel({
  features,
  folders,
  open,
  expandedFolderIds,
  hiddenFeatureIds,
  draggingFeatureId,
  draggingFolderId,
  exportMessage,
  onToggleOpen,
  onToggleFolder,
  onToggleFolderExpanded,
  onRenameFolder,
  onRemoveFolder,
  onToggleFeatureVisibility,
  onOpenFeature,
  onDeleteFeature,
  onExportMeasurement,
  onSetFeatureFolder,
  onCreateFolderAndAssign,
  onBeginDragFeature,
  onMoveDraggedFeature,
  onMoveDraggedFeatureToFolder,
  onBeginDragFolder,
  onMoveDraggedFolder,
}: MarkerPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const itemMenuRef = useRef<HTMLDivElement>(null);
  const folderMenuRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  openRef.current = open;
  const toggleOpenRef = useRef(onToggleOpen);
  toggleOpenRef.current = onToggleOpen;

  const [itemMenu, setItemMenu] = useState<FeatureItemMenuState | null>(null);
  const [folderMenu, setFolderMenu] = useState<FeatureFolderMenuState | null>(null);

  useEffect(() => {
    const onFocusMarkers = () => {
      if (!openRef.current) toggleOpenRef.current();
      window.requestAnimationFrame(() => focusFirstNavigable(panelRef.current));
    };
    window.addEventListener("kb-focus-markers", onFocusMarkers);
    return () => window.removeEventListener("kb-focus-markers", onFocusMarkers);
  }, []);

  const computeMenuCoords = (event: MouseEvent, maxHeight: number) => {
    const panelRect = panelRef.current?.getBoundingClientRect();
    const btnRect = event.currentTarget.getBoundingClientRect();
    const panelRight = panelRect ? panelRect.right + 6 : btnRect.right + 6;
    return {
      x: Math.min(panelRight, window.innerWidth - 220),
      y: Math.max(10, Math.min(btnRect.top, window.innerHeight - maxHeight)),
    };
  };

  const openFeatureMenu = (event: MouseEvent, feature: UserFeature) => {
    event.preventDefault();
    event.stopPropagation();
    const coords = computeMenuCoords(event, 340);
    setFolderMenu(null);
    setItemMenu({ ...coords, feature });
  };

  const openFolderMenu = (event: MouseEvent, folder: MarkerFolder) => {
    event.preventDefault();
    event.stopPropagation();
    const coords = computeMenuCoords(event, 180);
    setItemMenu(null);
    setFolderMenu({ ...coords, folder });
  };

  const renderFeatureRow = (feature: UserFeature) => (
    <FeatureRow
      key={feature.id}
      feature={feature}
      isHidden={hiddenFeatureIds.includes(feature.id)}
      isDragging={draggingFeatureId === feature.id}
      onBeginDrag={onBeginDragFeature}
      onMoveDragged={onMoveDraggedFeature}
      onToggleVisibility={onToggleFeatureVisibility}
      onOpenFeature={onOpenFeature}
      onOpenMenu={openFeatureMenu}
    />
  );

  const draggedFeature = draggingFeatureId !== null ? features.find((f) => f.id === draggingFeatureId) : undefined;
  const draggedHasFolder = Boolean(draggedFeature?.folder_id && folders.some((folder) => folder.id === draggedFeature.folder_id));
  const ungroupedFeatures = features.filter((feature) => !feature.folder_id || !folders.some((folder) => folder.id === feature.folder_id));

  return (
    <>
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
              const feature = features.find((f) => f.id === Number(featureRow.dataset.kbFeatureId));
              if (feature) {
                event.preventDefault();
                event.stopPropagation();
                onDeleteFeature(feature);
                return;
              }
            }
            const folderRow = active?.closest<HTMLElement>("[data-kb-folder-id]");
            if (folderRow && panelRef.current?.contains(folderRow)) {
              const folder = folders.find((f) => f.id === folderRow.dataset.kbFolderId);
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
        </div>
        {open && (
          <div className="max-h-[30vh] space-y-1 overflow-y-auto rounded-b-lg border-t border-slate-100 px-2 py-2 dark:border-zinc-800 sm:px-3">
            {exportMessage && (
              <div className={`rounded px-2 py-1 text-[11px] font-medium ${exportMessage.startsWith("Vienti epäonnistui") ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"}`}>
                {exportMessage}
              </div>
            )}
            {folders.map((folder: MarkerFolder) => {
              const folderFeatures = features.filter((feature) => feature.folder_id === folder.id);
              const isExpanded = expandedFolderIds.has(folder.id);
              const isDraggingThisFolder = draggingFolderId === folder.id;
              return (
                <div
                  key={folder.id}
                  onPointerEnter={() => {
                    if (draggingFolderId !== null) onMoveDraggedFolder(folder.id);
                  }}
                  className={`mt-1 rounded-md border p-1 transition-colors ${
                    isDraggingThisFolder
                      ? "border-blue-400 bg-blue-50/70 ring-1 ring-blue-400 dark:border-blue-500 dark:bg-blue-950/40"
                      : "border-slate-100 bg-slate-50/50 dark:border-zinc-800/80 dark:bg-zinc-900/30"
                  }`}
                >
                  <div
                    data-kb-row="true"
                    data-kb-folder-id={folder.id}
                    onPointerEnter={() => {
                      if (draggingFeatureId !== null) onMoveDraggedFeatureToFolder(folder.id);
                    }}
                    onContextMenu={(event) => openFolderMenu(event, folder)}
                    className="group/grp flex items-center justify-between gap-1 px-1 py-0.5 text-[11px] font-medium text-slate-600 dark:text-zinc-300"
                  >
                    <span
                      onPointerDown={(event) => onBeginDragFolder(event, folder.id)}
                      className={`touch-none text-slate-300 hover:text-slate-500 dark:text-zinc-600 dark:group-hover/grp:text-zinc-400 ${
                        isDraggingThisFolder ? "cursor-grabbing" : "cursor-grab"
                      }`}
                      title="Raahaa ryhmän järjestyksen muuttamiseksi"
                    >
                      <GripVertical size={13} />
                    </span>
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-200/70 dark:text-zinc-400 dark:hover:bg-zinc-800"
                      title={folder.visible ? "Piilota ryhmä kartalta" : "Näytä ryhmä kartalla"}
                      onClick={() => onToggleFolder(folder)}
                    >
                      {folder.visible ? <Eye size={13} /> : <EyeOff size={13} className="text-slate-400 dark:text-zinc-500" />}
                    </button>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-slate-200/70 dark:hover:bg-zinc-800"
                      onClick={() => onToggleFolderExpanded(folder.id)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? <ChevronDown size={13} className="shrink-0 text-slate-400 dark:text-zinc-500" /> : <ChevronRight size={13} className="shrink-0 text-slate-400 dark:text-zinc-500" />}
                      <Folder size={13} className="shrink-0 text-amber-500" />
                      <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500">({folderFeatures.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => openFolderMenu(event, folder)}
                      className="shrink-0 rounded p-0.5 text-slate-400 opacity-60 transition-colors hover:bg-slate-200/70 hover:text-slate-700 group-hover/grp:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                      title={`Ryhmän "${folder.name}" toiminnot`}
                      aria-label={`Ryhmän ${folder.name} toiminnot`}
                    >
                      <MoreHorizontal size={13} />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="ml-1.5 space-y-0.5 border-l border-slate-200 pl-2 pt-0.5 dark:border-zinc-700">
                      {folderFeatures.length === 0 ? (
                        <div
                          onPointerEnter={() => {
                            if (draggingFeatureId !== null) onMoveDraggedFeatureToFolder(folder.id);
                          }}
                          className="px-2 py-1 text-[11px] italic text-slate-400 dark:text-zinc-500"
                        >
                          Ei merkkejä tai mittauksia tässä kansiossa.
                        </div>
                      ) : (
                        folderFeatures.map(renderFeatureRow)
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {ungroupedFeatures.length === 0 && folders.length === 0 && features.length === 0 ? (
              <div className="px-2 py-1 text-[11px] italic text-slate-400 dark:text-zinc-500">
                Ei tallennettuja merkkejä tai mittauksia.
              </div>
            ) : (
              ungroupedFeatures.length > 0 && <div className="space-y-0.5 pt-0.5">{ungroupedFeatures.map(renderFeatureRow)}</div>
            )}
            {draggedHasFolder && (
              <div
                onPointerEnter={() => onMoveDraggedFeatureToFolder("")}
                className="mt-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-center text-[10px] text-slate-500 dark:border-zinc-700 dark:text-zinc-400"
              >
                Siirrä pois ryhmästä
              </div>
            )}
          </div>
        )}
      </div>
      {itemMenu && createPortal(
        <FeatureItemContextMenu
          menu={itemMenu}
          menuRef={itemMenuRef}
          folders={folders}
          isHidden={hiddenFeatureIds.includes(itemMenu.feature.id)}
          onClose={() => setItemMenu(null)}
          onToggleVisibility={onToggleFeatureVisibility}
          onEdit={onOpenFeature}
          onExport={onExportMeasurement}
          onSetFolder={onSetFeatureFolder}
          onCreateFolder={onCreateFolderAndAssign}
          onDelete={onDeleteFeature}
        />,
        document.body,
      )}
      {folderMenu && createPortal(
        <FeatureFolderContextMenu
          menu={folderMenu}
          menuRef={folderMenuRef}
          onClose={() => setFolderMenu(null)}
          onToggleVisibility={onToggleFolder}
          onRename={onRenameFolder}
          onDelete={onRemoveFolder}
        />,
        document.body,
      )}
    </>
  );
}
