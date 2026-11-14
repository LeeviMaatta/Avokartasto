import { Layers, MoreHorizontal } from "lucide-react";
import { useState, useEffect, useRef, type MouseEvent } from "react";
import { useMapStore } from "../../../store/mapStore";
import type { LocalSource } from "../../../infrastructure/tauri";
import FeaturePanel from "../../markers/components/FeaturePanel";
import LayerList from "./LayerList";
import type { LayerListItem } from "../model/layerListTypes";
import AddLayerModal from "./AddLayerModal";
import LayerEditorModal from "./LayerEditorModal";
import FolderEditor from "../../markers/components/FolderEditor";
import { usePersistedBool, usePersistedStringSet } from "../../settings/hooks/persistedUiState";
import { requiredSecrets } from "../../map/services/resolveUrl";
import { focusFirstNavigable, handleContainerArrowKeyDown } from "../../../shared/keyboardNavigation";
import { useLayerCrud, type LayerContextMenuState } from "../hooks/useLayerCrud";
import { useLayerGroupsAndDrag } from "../hooks/useLayerGroupsAndDrag";
import { useMarkerFoldersCrud } from "../../markers/hooks/useMarkerFoldersCrud";
import { LayerContextMenu } from "./LayerContextMenu";
import { GroupContextMenu } from "./GroupContextMenu";
import { LayerActionsMenu } from "./LayerActionsMenu";

export default function LayerSwitcher() {
  const [openLayers, toggleOpenLayers] = usePersistedBool("layersPanelOpen", true);
  const [openFeatures, toggleOpenFeatures] = usePersistedBool("featuresPanelOpen", true);
  const basemap = useMapStore((s) => s.basemap);
  const overlays = useMapStore((s) => s.overlays);
  const overlayOrder = useMapStore((s) => s.overlayOrder);
  const basemapOrder = useMapStore((s) => s.basemapOrder);
  const hiddenLayers = useMapStore((s) => s.hiddenLayers);
  const sources = useMapStore((s) => s.sources);
  const settings = useMapStore((s) => s.settings);
  const setBasemap = useMapStore((s) => s.setBasemap);
  const toggleOverlay = useMapStore((s) => s.toggleOverlay);
  const hideLayer = useMapStore((s) => s.hideLayer);
  const hideLayers = useMapStore((s) => s.hideLayers);
  const unhideLayers = useMapStore((s) => s.unhideLayers);
  const setLayerOrder = useMapStore((s) => s.setLayerOrder);
  const refreshSources = useMapStore((s) => s.reloadSources);
  const featuresVersion = useMapStore((s) => s.featuresVersion);
  const bumpFeatures = useMapStore((s) => s.bumpFeatures);

  const rawOverlayOpacity = Number(settings.uiOverlayOpacity ?? "1");
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;

  const containerRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openLayersRef = useRef(openLayers);
  openLayersRef.current = openLayers;
  const toggleOpenLayersRef = useRef(toggleOpenLayers);
  toggleOpenLayersRef.current = toggleOpenLayers;

  const [menu, setMenu] = useState<LayerContextMenuState | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ x: number; y: number; id: string; name: string } | null>(null);
  const [groupsMenuOpen, toggleGroupsMenuOpen] = usePersistedBool("layerGroupsMenuOpen", false);
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [actionMenu, setActionMenu] = useState<{ type: "layers"; x: number; y: number } | null>(null);
  const [expandedFolderIds, toggleFolderExpanded] = usePersistedStringSet("markerExpandedFolders");

  const crud = useLayerCrud({
    sources,
    settings,
    basemap,
    overlays,
    setBasemap,
    toggleOverlay,
    refreshSources,
    menu,
    setMenu,
  });

  const groupsDrag = useLayerGroupsAndDrag({
    settings,
    overlayOrder,
    basemapOrder,
    setLayerOrder,
    hideLayers,
    unhideLayers,
    onCloseMenus: () => {
      setMenu(null);
      setGroupMenu(null);
    },
  });

  const markerCrud = useMarkerFoldersCrud(
    settings,
    featuresVersion,
    bumpFeatures,
    () => setActionMenu(null),
  );

  const missing = (needs?: string) => Boolean(needs && !settings[needs]);

  const sortByOrder = (role: "basemap" | "overlay", orderList: string[]) =>
    sources
      .filter((s) => s.role === role)
      .map((s) => ({ id: `src:${s.id}`, name: s.name, needs: requiredSecrets(s)[0], note: s.note, source: s }))
      .sort((a, b) => {
        const ai = orderList.indexOf(a.id);
        const bi = orderList.indexOf(b.id);
        return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
      });

  const allBasemaps = sortByOrder("basemap", basemapOrder);
  const allOverlays = sortByOrder("overlay", overlayOrder);

  // Piilotetut tasot säilyvät all*-listoissa, jotta ne voidaan palauttaa,
  // mutta niitä ei näytetä aktiivisten karttatasojen luetteloissa.
  const hiddenGroupIds = new Set(groupsDrag.groups.filter((g) => g.hidden).map((g) => g.id));
  const hiddenGroupItems = groupsDrag.groups
    .filter((g) => g.hidden)
    .map((g) => ({
      id: g.id,
      name: g.name,
      role: g.role,
      count: Object.values(groupsDrag.layerGroupMap).filter((gid) => gid === g.id).length,
    }));
  const visibleBasemaps = allBasemaps.filter((layer) => !hiddenLayers.includes(layer.id)) as LayerListItem[];
  const visibleOverlays = allOverlays.filter((layer) => !hiddenLayers.includes(layer.id)) as LayerListItem[];
  const hiddenLayerItems = [
    ...allBasemaps
      .filter((layer) => hiddenLayers.includes(layer.id) && !hiddenGroupIds.has(groupsDrag.layerGroupMap[layer.id] ?? ""))
      .map((layer) => ({ ...layer, role: "basemap" as const })),
    ...allOverlays
      .filter((layer) => hiddenLayers.includes(layer.id) && !hiddenGroupIds.has(groupsDrag.layerGroupMap[layer.id] ?? ""))
      .map((layer) => ({ ...layer, role: "overlay" as const })),
  ];

  const restoreHiddenLayer = (id: string, role: "basemap" | "overlay") => {
    setActionMenu(null);
    useMapStore.getState().restoreLayer(id, role);
  };

  useEffect(() => {
    if (!menu && !groupMenu && !actionMenu) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setGroupMenu(null);
        setActionMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menu, groupMenu, actionMenu]);

  useEffect(() => {
    const onFocusLayers = () => {
      if (!openLayersRef.current) toggleOpenLayersRef.current();
      window.requestAnimationFrame(() => focusFirstNavigable(containerRef.current));
    };
    window.addEventListener("kb-focus-layers", onFocusLayers);
    return () => window.removeEventListener("kb-focus-layers", onFocusLayers);
  }, []);

  useEffect(() => {
    if (actionMenu) window.requestAnimationFrame(() => focusFirstNavigable(actionMenuRef.current));
  }, [actionMenu]);

  useEffect(() => {
    if (groupMenu) window.requestAnimationFrame(() => focusFirstNavigable(groupMenuRef.current));
  }, [groupMenu]);

  useEffect(() => {
    if (menu) window.requestAnimationFrame(() => focusFirstNavigable(menuRef.current));
  }, [menu]);

  const openMenu = (event: MouseEvent, id: string, name: string, overlay: boolean, source?: LocalSource) => {
    event.preventDefault();
    event.stopPropagation();
    const containerRect = containerRef.current?.getBoundingClientRect();
    const btnRect = event.currentTarget.getBoundingClientRect();
    const panelRight = containerRect ? containerRect.right + 6 : btnRect.right + 6;
    const x = Math.min(panelRight, window.innerWidth - 220);
    const y = Math.max(10, Math.min(btnRect.top, window.innerHeight - 340));
    setGroupMenu(null);
    setMenu({ x, y, id, name, overlay, source });
    setNewGroupModalOpen(false);
    setNewGroupName("");
  };

  const openGroupMenu = (event: MouseEvent, id: string, name: string) => {
    event.preventDefault();
    event.stopPropagation();
    const containerRect = containerRef.current?.getBoundingClientRect();
    const btnRect = event.currentTarget.getBoundingClientRect();
    const panelRight = containerRect ? containerRect.right + 6 : btnRect.right + 6;
    const x = Math.min(panelRight, window.innerWidth - 220);
    const y = Math.max(10, Math.min(btnRect.top, window.innerHeight - 160));
    setMenu(null);
    setGroupMenu({ x, y, id, name });
  };

  return (
    <>
      <div className="absolute left-2 top-2 z-10 flex w-[min(16rem,calc(100vw-1rem))] flex-col gap-2 sm:left-3 sm:top-3" style={{ opacity: overlayOpacity }}>
        {/* Karttatasot */}
        <div ref={containerRef} onKeyDown={(e) => handleContainerArrowKeyDown(e)} className="relative z-[70] overflow-hidden rounded-lg bg-white/95 dark:bg-zinc-950/95 dark:text-white text-sm shadow-lg backdrop-blur">
          <div data-kb-row="true" className="flex items-center justify-between px-3 py-2">
            <button aria-expanded={openLayers} className="flex items-center gap-2 font-semibold" onClick={toggleOpenLayers}>
              <Layers size={16} /> Karttatasot
            </button>
            <button
              className="rounded p-1 text-[#1671a8] hover:bg-slate-100"
              title="Karttatason toiminnot"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setActionMenu((current) => (current?.type === "layers" ? null : {
                  type: "layers",
                  x: Math.min(rect.right, window.innerWidth - 280),
                  y: rect.bottom + 6,
                }));
              }}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
          {openLayers && (
            <LayerList
              basemaps={visibleBasemaps}
              overlays={visibleOverlays}
              hiddenLayers={hiddenLayerItems}
              hiddenGroups={hiddenGroupItems}
              groups={groupsDrag.groups}
              layerGroupMap={groupsDrag.layerGroupMap}
              basemap={basemap}
              activeOverlays={overlays}
              dragging={groupsDrag.dragging}
              draggingGroup={groupsDrag.draggingGroup}
              missing={missing}
              onBeginDrag={groupsDrag.beginDrag}
              onMoveDraggedLayer={groupsDrag.moveDraggedLayer}
              onBeginDragGroup={groupsDrag.beginDragGroup}
              onMoveDraggedGroup={groupsDrag.moveDraggedGroup}
              onMoveDraggedGroupOverLayer={groupsDrag.moveDraggedGroupOverLayer}
              onMoveLayerOverGroup={groupsDrag.moveLayerOverGroup}
              onContextMenu={openMenu}
              onOpenMenu={openMenu}
              onOpenGroupMenu={openGroupMenu}
              onRestoreLayer={restoreHiddenLayer}
              onRestoreGroup={groupsDrag.restoreGroup}
              onSetBasemap={setBasemap}
              onToggleOverlay={toggleOverlay}
            />
          )}
        </div>

        <FeaturePanel
          features={markerCrud.features}
          folders={markerCrud.folders}
          open={openFeatures}
          folderMenuOpen={folderMenuOpen}
          expandedFolderIds={expandedFolderIds}
          folderDraft={markerCrud.folderDraft}
          hiddenFeatureIds={markerCrud.hiddenFeatureIds}
          onToggleOpen={toggleOpenFeatures}
          onToggleFolderMenu={() => setFolderMenuOpen(!folderMenuOpen)}
          onFolderDraftChange={markerCrud.setFolderDraft}
          onAddFolder={markerCrud.addFolder}
          onToggleFolder={markerCrud.toggleFolderVisibility}
          onToggleFolderExpanded={toggleFolderExpanded}
          onRenameFolder={markerCrud.renameFolder}
          onRemoveFolder={markerCrud.removeFolder}
          onToggleFeatureVisibility={markerCrud.toggleFeatureVisibility}
          onOpenFeature={markerCrud.openEditFeature}
          onDeleteFeature={(feature) => void markerCrud.deleteSelectedFeature(feature)}
        />
        {actionMenu && (
          <button
            type="button"
            aria-label="Sulje toimintovalikko"
            className="fixed inset-0 z-[60] cursor-default"
            onClick={() => setActionMenu(null)}
          />
        )}
        {actionMenu?.type === "layers" && (
          <LayerActionsMenu
            actionMenu={actionMenu}
            actionMenuRef={actionMenuRef}
            onClose={() => setActionMenu(null)}
            onSelectRole={(role) => {
              crud.setNewSource({ ...crud.newSource, role });
              crud.setAddOpen(true);
              setActionMenu(null);
            }}
          />
        )}
      </div>
      <AddLayerModal
        value={crud.newSource}
        open={crud.addOpen}
        onChange={crud.setNewSource}
        onClose={() => crud.setAddOpen(false)}
        onSubmit={() => void crud.addNewSource()}
      />
      {groupMenu && (
        <GroupContextMenu
          groupMenu={groupMenu}
          groupMenuRef={groupMenuRef}
          onClose={() => setGroupMenu(null)}
          onHideGroup={groupsDrag.hideGroup}
          onDeleteGroup={(id) => void groupsDrag.deleteGroup(id)}
        />
      )}
      {menu && (
        <LayerContextMenu
          menu={menu}
          menuRef={menuRef}
          groups={groupsDrag.groups}
          layerGroupMap={groupsDrag.layerGroupMap}
          groupsMenuOpen={groupsMenuOpen}
          newGroupModalOpen={newGroupModalOpen}
          newGroupName={newGroupName}
          onClose={() => setMenu(null)}
          onHideLayer={hideLayer}
          onEditSource={() => void crud.editSource()}
          onToggleGroupsMenu={toggleGroupsMenuOpen}
          onSetLayerGroup={groupsDrag.setLayerGroup}
          onCreateGroup={groupsDrag.createGroup}
          onSetNewGroupModalOpen={setNewGroupModalOpen}
          onSetNewGroupName={setNewGroupName}
          onRemoveSource={() => void crud.remove()}
          onResetSource={() => void crud.resetDefault()}
          onDuplicateSource={() => void crud.duplicate()}
        />
      )}
      <LayerEditorModal
        editDraft={crud.editDraft}
        viewDraft={crud.viewDraft}
        onEditDraftChange={crud.setEditDraft}
        onViewDraftChange={crud.setViewDraft}
        onClose={() => crud.setEditDraft(null)}
        onSaveSource={() => void crud.saveSource()}
      />
      <FolderEditor
        folder={markerCrud.folderEdit}
        name={markerCrud.folderEditName}
        onNameChange={markerCrud.setFolderEditName}
        onClose={() => markerCrud.setFolderEdit(null)}
        onSave={markerCrud.saveFolderEdit}
      />
    </>
  );
}
