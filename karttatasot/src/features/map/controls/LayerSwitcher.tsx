import { Layers, MoreHorizontal } from "lucide-react";
import { useState, useEffect, type MouseEvent, type PointerEvent } from "react";
import { useMapStore, type LayerCopy } from "../../../store/mapStore";
import { BASEMAPS, OVERLAYS } from "../layers";
import { addSource, deleteFeature, deleteSource, listFeatures, updateSource, type LocalSource, type UserFeature } from "../../../infrastructure/tauriBridge";
import { requestConfirmation } from "../../../app/confirmation";
import FeaturePanel from "../../markers/components/FeaturePanel";
import type { MarkerFolder } from "../../markers/model/markerTypes";
import LayerList from "../../layers/components/LayerList";
import type { LayerListItem } from "../../layers/model/layerListTypes";
import AddLayerModal, { type NewLayerSource } from "../../layers/components/AddLayerModal";
import LayerEditorModal from "../../layers/components/LayerEditorModal";
import type { LayerViewDraft } from "../../layers/model/layerViewTypes";
import FolderEditor from "../../markers/components/FolderEditor";

export default function LayerSwitcher() {
  const [openLayers, setOpenLayers] = useState(true);
  const [openFeatures, setOpenFeatures] = useState(true);
  const { basemap, overlays, overlayOrder, basemapOrder, hiddenLayers, sources, layerCopies, settings, setBasemap, toggleOverlay, hideLayer, restoreLayer, setLayerOrder, duplicateLayer, deleteLayerCopy, reloadSources: refreshSources, featuresVersion, bumpFeatures } = useMapStore();
  const rawOverlayOpacity = Number(settings.uiOverlayOpacity ?? "1");
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;
  const [features, setFeatures] = useState<UserFeature[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string; name: string; source?: LocalSource; copy?: LayerCopy; overlay: boolean } | null>(null);
  const [editDraft, setEditDraft] = useState<LocalSource | null>(null);
  const [editLayer, setEditLayer] = useState<{ id: string; name: string; overlay: boolean } | null>(null);
  const [selectedBasemap, setSelectedBasemap] = useState(basemap);
  const [apiDraft, setApiDraft] = useState<Record<string, string>>({});
  const [viewDraft, setViewDraft] = useState<LayerViewDraft>({ zoomOffset: 0, magnification: 1 });
  const [addOpen, setAddOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [actionMenu, setActionMenu] = useState<{ type: "layers"; x: number; y: number } | null>(null);
  const [newSource, setNewSource] = useState<NewLayerSource>({
    name: "", base_path: "", pattern: "{z}/{x}/{y}.png", role: "overlay" as LocalSource["role"],
    api_type: "tile" as LocalSource["api_type"], tile_size: 256, max_zoom: 19, layer_name: "", style: "", attribution: "",
  });
  const [dragging, setDragging] = useState<{ kind: "overlay" | "basemap"; id: string } | null>(null);
  const [folders, setFolders] = useState<MarkerFolder[]>([]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [folderDraft, setFolderDraft] = useState("");
  const [folderEdit, setFolderEdit] = useState<MarkerFolder | null>(null);
  const [folderEditName, setFolderEditName] = useState("");

  const missing = (needs?: string) => Boolean(needs && !settings[needs]);

  useEffect(() => {
    listFeatures().then(setFeatures).catch((error) => console.error("Merkkien lataus epäonnistui", error));
  }, [featuresVersion]);

  useEffect(() => {
    try {
      const parsed = JSON.parse(settings.markerFolders ?? "[]") as MarkerFolder[];
      setFolders(Array.isArray(parsed) ? parsed.filter((folder) => typeof folder.id === "string" && typeof folder.name === "string") : []);
    } catch {
      setFolders([]);
    }
  }, [settings.markerFolders]);

  const saveFolders = async (next: MarkerFolder[]) => {
    setFolders(next);
    await useMapStore.getState().setSetting("markerFolders", JSON.stringify(next));
  };

  const hiddenFeatureIds = (() => {
    try {
      const parsed = JSON.parse(settings.hiddenFeatures ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)) : [];
    } catch {
      return [];
    }
  })();

  const saveHiddenFeatureIds = (ids: number[]) => {
    void useMapStore.getState().setSetting("hiddenFeatures", JSON.stringify([...new Set(ids)]));
  };

  const toggleFeatureVisibility = (id: number) => {
    saveHiddenFeatureIds(hiddenFeatureIds.includes(id)
      ? hiddenFeatureIds.filter((featureId) => featureId !== id)
      : [...hiddenFeatureIds, id]);
  };

  const toggleFolderVisibility = (folder: MarkerFolder) => {
    void saveFolders(folders.map((item) => item.id === folder.id ? { ...item, visible: !item.visible } : item));
  };

  const renameFolder = (folder: MarkerFolder) => {
    setFolderEdit(folder);
    setFolderEditName(folder.name);
    setActionMenu(null);
  };

  const saveFolderEdit = () => {
    const name = folderEditName.trim();
    if (folderEdit && name && name !== folderEdit.name) {
      void saveFolders(folders.map((item) => item.id === folderEdit.id ? { ...item, name } : item));
    }
    setFolderEdit(null);
  };

  const removeFolder = async (folder: MarkerFolder) => {
    if (await requestConfirmation(`Poistetaanko kansio "${folder.name}"?`)) void saveFolders(folders.filter((item) => item.id !== folder.id));
    setActionMenu(null);
  };

  const addFolder = () => {
    const name = folderDraft.trim();
    if (!name) return;
    void saveFolders([...folders, { id: `folder-${Date.now()}`, name, visible: true }]);
    setFolderDraft("");
  };

  const openEditFeature = (feature: UserFeature) => {
    window.dispatchEvent(new CustomEvent<UserFeature>(
      feature.feature_type === "POINT" ? "open-marker-editor" : "open-measurement-editor",
      { detail: feature },
    ));
  };

  const allBasemaps = [
    ...BASEMAPS,
    ...layerCopies.filter((copy) => copy.role === "basemap").map((copy) => ({ id: `copy:${copy.id}`, name: `↳ ${copy.name}`, needs: undefined, note: "Käyttäjän kopio", copy })),
    ...sources.filter((s) => s.role === "basemap").map((s) => ({ id: `local:${s.id}`, name: `📁 ${s.name}`, needs: undefined, note: "Käyttäjän pohjakartta", source: s }))
  ].sort((a, b) => {
    const ai = basemapOrder.indexOf(a.id);
    const bi = basemapOrder.indexOf(b.id);
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
  });
  const allOverlays = [
    ...OVERLAYS,
    ...layerCopies.filter((copy) => copy.role === "overlay").map((copy) => ({ id: `copy:${copy.id}`, name: `↳ ${copy.name}`, needs: undefined, note: "Käyttäjän kopio", copy })),
    ...sources.filter((s) => s.role === "overlay").map((s) => ({ id: `local:${s.id}`, name: `📁 ${s.name}`, needs: undefined, note: "Käyttäjän päällys", source: s })),
  ].sort((a, b) => {
    const ai = overlayOrder.indexOf(a.id);
    const bi = overlayOrder.indexOf(b.id);
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
  });
  // Piilotetut tasot säilyvät all*-listoissa, jotta ne voidaan palauttaa,
  // mutta niitä ei näytetä aktiivisten karttatasojen luetteloissa.
  const visibleBasemaps = allBasemaps.filter((layer) => !hiddenLayers.includes(layer.id)) as LayerListItem[];
  const visibleOverlays = allOverlays.filter((layer) => !hiddenLayers.includes(layer.id)) as LayerListItem[];

  // Palautetaan taso sekä piilotettujen listalta että aktiiviseen karttatilaan.
  // Basemap on valittava uudelleen, overlay puolestaan aktivoidaan tarvittaessa.
  const restoreHiddenLayer = (id: string, role: "basemap" | "overlay") => {
    setActionMenu(null);
    useMapStore.getState().restoreLayer(id, role);
  };

  useEffect(() => {
    const stopDragging = () => setDragging(null);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

  const beginDrag = (event: PointerEvent, kind: "overlay" | "basemap", id: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging({ kind, id });
  };

  const moveDraggedLayer = (kind: "overlay" | "basemap", targetId: string, ids: string[]) => {
    if (!dragging || dragging.kind !== kind || dragging.id === targetId) return;
    const order = [...ids];
    const from = order.indexOf(dragging.id);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, dragging.id);
    setLayerOrder(kind, order);
  };

  const addNewSource = async () => {
    if (!newSource.base_path.trim()) return;
    await addSource(
      newSource.name.trim() || "Uusi karttataso",
      newSource.base_path.trim(),
      newSource.pattern.trim() || "{z}/{x}/{y}.png",
      newSource.role,
      1,
      Math.max(0, Math.min(24, Math.round(newSource.max_zoom))),
      newSource.attribution.trim(),
      newSource.api_type,
      Math.max(64, Math.min(2048, Math.round(newSource.tile_size))),
      newSource.layer_name.trim(),
      newSource.style.trim(),
    );
    await refreshSources();
    setAddOpen(false);
  };

  const openMenu = (event: MouseEvent, id: string, name: string, overlay: boolean, source?: LocalSource, copy?: LayerCopy) => {
    event.preventDefault();
    setMenu({ x: event.clientX, y: event.clientY, id, name, overlay, source, copy });
  };

  const editSource = async () => {
    if (!menu) return;
    const source = menu.source;
    setMenu(null);
    setApiDraft({
      mmlKey: settings.mmlKey ?? "",
      lantmaterietUsername: settings.lantmaterietUsername ?? "",
      lantmaterietPassword: settings.lantmaterietPassword ?? "",
      owmKey: settings.owmKey ?? "",
    });
    let savedView: LayerViewDraft = { zoomOffset: 0, magnification: 1 };
    try {
      const parsed = JSON.parse(settings.layerViewSettings ?? "{}") as Record<string, Partial<LayerViewDraft>>;
      const value = parsed[menu.id];
      savedView = {
        zoomOffset: Number.isFinite(value?.zoomOffset) ? Math.max(-8, Math.min(8, Number(value?.zoomOffset))) : 0,
        magnification: value?.magnification === 2 || value?.magnification === 4 ? value.magnification : 1,
      };
    } catch {
      savedView = { zoomOffset: 0, magnification: 1 };
    }
    setViewDraft(savedView);
    if (source) setEditDraft({ ...source });
    else {
      setSelectedBasemap(basemap);
      setEditLayer({ id: menu.id, name: menu.name, overlay: menu.overlay });
    }
  };

  const saveViewSettings = async (id: string) => {
    let all: Record<string, LayerViewDraft> = {};
    try {
      const parsed = JSON.parse(settings.layerViewSettings ?? "{}");
      if (parsed && typeof parsed === "object") all = parsed;
    } catch {
      all = {};
    }
    all[id] = viewDraft;
    await useMapStore.getState().setSettings({
      ...settings,
      ...apiDraft,
      googleKey: "",
      layerViewSettings: JSON.stringify(all),
    });
  };

  const saveSource = async () => {
    if (!editDraft) return;
    await updateSource(
      editDraft.id,
      editDraft.name.trim() || "Karttataso",
      editDraft.base_path.trim(),
      editDraft.pattern.trim() || "{z}/{x}/{y}.png",
      editDraft.role,
      Math.min(1, Math.max(0, editDraft.opacity)),
      Math.min(24, Math.max(0, Math.round(editDraft.max_zoom))),
      editDraft.attribution.trim(),
      editDraft.api_type,
      Math.max(64, Math.min(2048, Math.round(editDraft.tile_size))),
      editDraft.layer_name.trim(),
      editDraft.style.trim(),
    );
    await refreshSources();
    await saveViewSettings(`local:${editDraft.id}`);
    if (basemap === `local:${editDraft.id}` && editDraft.role === "overlay") setBasemap("osm");
    setEditDraft(null);
  };

  const saveLayerEdit = async () => {
    if (!editLayer) return;
    await saveViewSettings(editLayer.id);
    setBasemap(selectedBasemap);
    setEditLayer(null);
  };

  const duplicate = async () => {
    if (!menu) return;
    if (menu.source) {
      await addSource(
        `${menu.source.name} (kopio)`,
        menu.source.base_path,
        menu.source.pattern,
        menu.source.role,
        menu.source.opacity,
        menu.source.max_zoom,
        menu.source.attribution,
        menu.source.api_type,
        menu.source.tile_size,
        menu.source.layer_name,
        menu.source.style,
      );
      await refreshSources();
    } else if (menu.copy) {
      duplicateLayer(menu.copy.sourceId, menu.copy.name, menu.copy.role);
    } else {
      duplicateLayer(menu.id, menu.name, menu.overlay ? "overlay" : "basemap");
    }
    setMenu(null);
  };

  const remove = async () => {
    if (!menu) return;
    if (menu.copy) {
      if (await requestConfirmation(`Poistetaanko karttatason kopio "${menu.copy.name}"?`)) deleteLayerCopy(menu.copy.id);
    } else if (menu.source && await requestConfirmation(`Poistetaanko karttataso "${menu.source.name}"?`)) {
      await deleteSource(menu.source.id);
      await refreshSources();
      if (basemap === menu.id) setBasemap("osm");
    }
    setMenu(null);
  };

  const deleteSelectedFeature = async (feature: UserFeature) => {
    if (await requestConfirmation(`Haluatko varmasti poistaa merkinnän "${feature.title}"?`)) {
      await deleteFeature(feature.id);
      bumpFeatures();
    }
  };

  return (
    <>
      <div className="absolute left-2 top-2 z-10 flex w-[min(16rem,calc(100vw-1rem))] flex-col gap-2 sm:left-3 sm:top-3" style={{ opacity: overlayOpacity }}>
      {/* Karttatasot */}
      <div className="relative z-[70] rounded-lg bg-white/95 dark:bg-zinc-950/95 dark:text-white text-sm shadow-lg backdrop-blur">
        <div className="flex items-center justify-between px-3 py-2">
          <button className="flex items-center gap-2 font-semibold" onClick={() => setOpenLayers(!openLayers)}>
            <Layers size={16} /> Karttatasot
          </button>
          <button className="rounded p-1 text-[#1671a8] hover:bg-slate-100" title="Karttatason toiminnot" onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setActionMenu((current) => current?.type === "layers" ? null : {
              type: "layers",
              x: Math.min(rect.right, window.innerWidth - 280),
              y: rect.bottom + 6,
            });
          }}><MoreHorizontal size={18} /></button>
        </div>
        {actionMenu?.type === "layers" && (
          <div
            className="fixed z-[70] max-h-[min(70vh,32rem)] w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-gray-800 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
            style={{ left: Math.max(8, actionMenu.x - 256), top: Math.min(actionMenu.y, window.innerHeight - 280) }}
          >
            <div className="mb-1 font-semibold text-gray-500">Lisää</div>
            <div className="mb-2 grid grid-cols-2 gap-1">
              <button className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-gray-600 dark:hover:bg-gray-700" onClick={() => { setNewSource({ ...newSource, role: "basemap" }); setAddOpen(true); setActionMenu(null); }}>Karttataso</button>
              <button className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-gray-600 dark:hover:bg-gray-700" onClick={() => { setNewSource({ ...newSource, role: "overlay" }); setAddOpen(true); setActionMenu(null); }}>Päällys</button>
            </div>
            <div className="mb-1 font-semibold text-gray-500">Piilotetut tasot</div>
            {hiddenLayers.length === 0 ? (
              <div className="text-gray-400">Ei piilotettuja tasoja.</div>
            ) : [...allBasemaps.filter((layer) => hiddenLayers.includes(layer.id)).map((layer) => ({ ...layer, role: "basemap" as const })), ...allOverlays.filter((layer) => hiddenLayers.includes(layer.id)).map((layer) => ({ ...layer, role: "overlay" as const }))].map((layer) => (
              <button key={layer.id} className="block w-full rounded px-2 py-1 text-left hover:bg-slate-100 dark:hover:bg-gray-700" onClick={() => restoreHiddenLayer(layer.id, layer.role)}>Ota näkyviin: {layer.name}</button>
            ))}
          </div>
        )}
        {openLayers && <LayerList
          basemaps={visibleBasemaps}
          overlays={visibleOverlays}
          basemap={basemap}
          activeOverlays={overlays}
          dragging={dragging}
          missing={missing}
          onBeginDrag={beginDrag}
          onMoveDraggedLayer={moveDraggedLayer}
          onContextMenu={openMenu}
          onSetBasemap={setBasemap}
          onToggleOverlay={toggleOverlay}
        />}
      </div>

      <FeaturePanel
        features={features}
        folders={folders}
        open={openFeatures}
        folderMenuOpen={folderMenuOpen}
        expandedFolderIds={expandedFolderIds}
        folderDraft={folderDraft}
        hiddenFeatureIds={hiddenFeatureIds}
        onToggleOpen={() => setOpenFeatures(!openFeatures)}
        onToggleFolderMenu={() => setFolderMenuOpen(!folderMenuOpen)}
        onFolderDraftChange={setFolderDraft}
        onAddFolder={addFolder}
        onToggleFolder={toggleFolderVisibility}
        onToggleFolderExpanded={(id) => setExpandedFolderIds((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })}
        onRenameFolder={renameFolder}
        onRemoveFolder={removeFolder}
        onToggleFeatureVisibility={toggleFeatureVisibility}
        onOpenFeature={openEditFeature}
        onDeleteFeature={(feature) => void deleteSelectedFeature(feature)}
      />
      {actionMenu && (
        <button
          type="button"
          aria-label="Sulje toimintovalikko"
          className="fixed inset-0 z-[60] cursor-default"
          onClick={() => setActionMenu(null)}
        />
      )}
      </div>
      <AddLayerModal value={newSource} open={addOpen} onChange={setNewSource} onClose={() => setAddOpen(false)} onSubmit={() => void addNewSource()} />
      {menu && (
        <div
          className="fixed z-[80] min-w-44 rounded-lg border border-gray-200 bg-white py-1 text-xs text-gray-800 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
        >
          <button className="block w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { hideLayer(menu.id, menu.overlay ? "overlay" : "basemap"); setMenu(null); }}>
            Piilota taso
          </button>
          <button className="block w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => void editSource()}>
            Muokkaa
          </button>
          {(menu.source || menu.copy) && (
            <>
              <button className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => void remove()}>
                Poista
              </button>
            </>
          )}
          <button className="block w-full px-3 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => void duplicate()}>
            Monista
          </button>
        </div>
      )}
      <LayerEditorModal
        editDraft={editDraft}
        editLayer={editLayer}
        selectedBasemap={selectedBasemap}
        viewDraft={viewDraft}
        apiDraft={apiDraft}
        onSelectedBasemapChange={setSelectedBasemap}
        onEditDraftChange={setEditDraft}
        onViewDraftChange={setViewDraft}
        onApiDraftChange={setApiDraft}
        onClose={() => { setEditDraft(null); setEditLayer(null); }}
        onSaveSource={() => void saveSource()}
        onSaveLayer={() => void saveLayerEdit()}
      />
      <FolderEditor folder={folderEdit} name={folderEditName} onNameChange={setFolderEditName} onClose={() => setFolderEdit(null)} onSave={saveFolderEdit} />
    </>
  );
}