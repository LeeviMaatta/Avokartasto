import { 
  Layers, 
  MoreHorizontal, 
  Folder, 
  Plus, 
  Check, 
  ChevronRight, 
  ChevronDown, 
  EyeOff, 
  Pencil, 
  Trash2, 
  RotateCcw, 
  Copy 
} from "lucide-react";
import { useState, useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { useMapStore } from "../../../store/mapStore";
import { addSourceConfig, deleteFeature, deleteSource, listFeatures, resetSourceToDefault, updateFeature, updateSourceConfig, type LocalSource, type UserFeature } from "../../../infrastructure/tauriBridge";
import { requestConfirmation } from "../../../app/confirmation";
import FeaturePanel from "../../markers/components/FeaturePanel";
import type { MarkerFolder } from "../../markers/model/markerTypes";
import LayerList from "../../layers/components/LayerList";
import type { LayerListItem, LayerGroup } from "../../layers/model/layerListTypes";
import AddLayerModal, { type NewLayerSource } from "../../layers/components/AddLayerModal";
import LayerEditorModal from "../../layers/components/LayerEditorModal";
import type { LayerViewDraft } from "../../layers/model/layerViewTypes";
import FolderEditor from "../../markers/components/FolderEditor";
import { usePersistedBool, usePersistedStringSet } from "../../settings/model/persistedUiState";
import { requiredSecrets } from "../sources/resolveUrl";

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
  const [features, setFeatures] = useState<UserFeature[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string; name: string; source?: LocalSource; overlay: boolean } | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ x: number; y: number; id: string; name: string } | null>(null);
  const [groups, setGroups] = useState<LayerGroup[]>([]);
  const [layerGroupMap, setLayerGroupMap] = useState<Record<string, string>>({});
  const [groupsMenuOpen, toggleGroupsMenuOpen] = usePersistedBool("layerGroupsMenuOpen", false);
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
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
    api_type: "local_tile" as LocalSource["api_type"], tile_size: 256, max_zoom: 19, layer_name: "", style: "", attribution: "",
  });
  const [dragging, setDragging] = useState<{ kind: "overlay" | "basemap"; id: string } | null>(null);
  const [draggingGroup, setDraggingGroup] = useState<{ role: "overlay" | "basemap"; id: string } | null>(null);
  const [folders, setFolders] = useState<MarkerFolder[]>([]);
  const [expandedFolderIds, toggleFolderExpanded] = usePersistedStringSet("markerExpandedFolders");
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

  useEffect(() => {
    try {
      const parsedGroups = JSON.parse(settings.layerGroups ?? "[]") as LayerGroup[];
      setGroups(Array.isArray(parsedGroups) ? parsedGroups.filter((g) => g && typeof g.id === "string" && typeof g.name === "string") : []);
    } catch {
      setGroups([]);
    }
    try {
      const parsedMap = JSON.parse(settings.layerGroupMap ?? "{}") as Record<string, string>;
      setLayerGroupMap(parsedMap && typeof parsedMap === "object" ? parsedMap : {});
    } catch {
      setLayerGroupMap({});
    }
  }, [settings.layerGroups, settings.layerGroupMap]);

  const setLayerGroup = (layerId: string, groupId: string | null) => {
    const nextMap = { ...layerGroupMap };
    if (!groupId) {
      delete nextMap[layerId];
    } else {
      nextMap[layerId] = groupId;
    }
    setLayerGroupMap(nextMap);
    void useMapStore.getState().setSetting("layerGroupMap", JSON.stringify(nextMap));
    setMenu(null);
  };

  const createGroup = (name: string, assignLayerId?: string, role?: "basemap" | "overlay") => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newGroup: LayerGroup = { id: `grp-${Date.now()}`, name: trimmed, ...(role ? { role } : {}) };
    const nextGroups = [...groups, newGroup];
    setGroups(nextGroups);
    void useMapStore.getState().setSetting("layerGroups", JSON.stringify(nextGroups));
    if (assignLayerId) {
      const nextMap = { ...layerGroupMap, [assignLayerId]: newGroup.id };
      setLayerGroupMap(nextMap);
      void useMapStore.getState().setSetting("layerGroupMap", JSON.stringify(nextMap));
    }
    setMenu(null);
  };

  const hideGroup = (groupId: string) => {
    const layerIdsInGroup = Object.keys(layerGroupMap).filter((id) => layerGroupMap[id] === groupId);
    const nextGroups = groups.map((g) => (g.id === groupId ? { ...g, hidden: true } : g));
    setGroups(nextGroups);
    void useMapStore.getState().setSetting("layerGroups", JSON.stringify(nextGroups));
    if (layerIdsInGroup.length > 0) {
      hideLayers(layerIdsInGroup);
    }
    setGroupMenu(null);
  };

  const restoreGroup = (groupId: string) => {
    const layerIdsInGroup = Object.keys(layerGroupMap).filter((id) => layerGroupMap[id] === groupId);
    const nextGroups = groups.map((g) => (g.id === groupId ? { id: g.id, name: g.name, ...(g.role ? { role: g.role } : {}) } : g));
    setGroups(nextGroups);
    void useMapStore.getState().setSetting("layerGroups", JSON.stringify(nextGroups));
    if (layerIdsInGroup.length > 0) {
      unhideLayers(layerIdsInGroup);
    }
  };

  const deleteGroup = async (groupId: string) => {
    const target = groups.find((g) => g.id === groupId);
    if (!target) return;
    setGroupMenu(null);
    const layerIdsInGroup = Object.keys(layerGroupMap).filter((id) => layerGroupMap[id] === groupId);
    const confirmMsg = layerIdsInGroup.length > 0
      ? `Haluatko varmasti poistaa ryhmän "${target.name}"? Ryhmän sisällä olevat tasot (${layerIdsInGroup.length} kpl) piilotetaan.`
      : `Haluatko varmasti poistaa ryhmän "${target.name}"?`;
    if (await requestConfirmation(confirmMsg)) {
      const nextGroups = groups.filter((g) => g.id !== groupId);
      setGroups(nextGroups);
      void useMapStore.getState().setSetting("layerGroups", JSON.stringify(nextGroups));
      const nextMap = { ...layerGroupMap };
      layerIdsInGroup.forEach((id) => {
        delete nextMap[id];
      });
      setLayerGroupMap(nextMap);
      void useMapStore.getState().setSetting("layerGroupMap", JSON.stringify(nextMap));
      if (layerIdsInGroup.length > 0) {
        hideLayers(layerIdsInGroup);
      }
    }
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
    if (await requestConfirmation(`Poistetaanko kansio "${folder.name}"?`)) {
      const affected = features.filter((item) => item.folder_id === folder.id);
      await Promise.all(
        affected.map((item) =>
          updateFeature(item.id, item.title, item.description, item.feature_type, item.geojson, "", item.color, item.image_data),
        ),
      );
      await saveFolders(folders.filter((item) => item.id !== folder.id));
      if (affected.length > 0) bumpFeatures();
    }
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
    ...sources.filter((s) => s.role === "basemap").map((s) => ({ id: `src:${s.id}`, name: s.name, needs: requiredSecrets(s)[0], note: s.note, source: s }))
  ].sort((a, b) => {
    const ai = basemapOrder.indexOf(a.id);
    const bi = basemapOrder.indexOf(b.id);
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
  });
  const allOverlays = [
    ...sources.filter((s) => s.role === "overlay").map((s) => ({ id: `src:${s.id}`, name: s.name, needs: requiredSecrets(s)[0], note: s.note, source: s })),
  ].sort((a, b) => {
    const ai = overlayOrder.indexOf(a.id);
    const bi = overlayOrder.indexOf(b.id);
    return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
  });
  // Piilotetut tasot säilyvät all*-listoissa, jotta ne voidaan palauttaa,
  // mutta niitä ei näytetä aktiivisten karttatasojen luetteloissa.
  const hiddenGroupIds = new Set(groups.filter((g) => g.hidden).map((g) => g.id));
  const hiddenGroupItems = groups
    .filter((g) => g.hidden)
    .map((g) => ({
      id: g.id,
      name: g.name,
      role: g.role,
      count: Object.values(layerGroupMap).filter((gid) => gid === g.id).length,
    }));
  const visibleBasemaps = allBasemaps.filter((layer) => !hiddenLayers.includes(layer.id)) as LayerListItem[];
  const visibleOverlays = allOverlays.filter((layer) => !hiddenLayers.includes(layer.id)) as LayerListItem[];
  const hiddenLayerItems = [
    ...allBasemaps
      .filter((layer) => hiddenLayers.includes(layer.id) && !hiddenGroupIds.has(layerGroupMap[layer.id] ?? ""))
      .map((layer) => ({ ...layer, role: "basemap" as const })),
    ...allOverlays
      .filter((layer) => hiddenLayers.includes(layer.id) && !hiddenGroupIds.has(layerGroupMap[layer.id] ?? ""))
      .map((layer) => ({ ...layer, role: "overlay" as const })),
  ];

  // Palautetaan taso sekä piilotettujen listalta että aktiiviseen karttatilaan.
  // Basemap on valittava uudelleen, overlay puolestaan aktivoidaan tarvittaessa.
  const restoreHiddenLayer = (id: string, role: "basemap" | "overlay") => {
    setActionMenu(null);
    useMapStore.getState().restoreLayer(id, role);
  };

  useEffect(() => {
    const stopDragging = () => {
      setDragging(null);
      setDraggingGroup(null);
    };
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, []);

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

  const beginDragGroup = (event: PointerEvent, role: "overlay" | "basemap", groupId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setDraggingGroup({ role, id: groupId });
  };

  const applyLayerOrderPreservingHidden = (role: "overlay" | "basemap", visibleOrder: string[]) => {
    const existing = role === "overlay" ? overlayOrder : basemapOrder;
    const visibleSet = new Set(visibleOrder);
    const hiddenRest = existing.filter((id) => !visibleSet.has(id));
    setLayerOrder(role, [...visibleOrder, ...hiddenRest]);
  };

  const moveDraggedGroup = (role: "overlay" | "basemap", targetGroupId: string, ids: string[]) => {
    if (!draggingGroup || draggingGroup.role !== role || draggingGroup.id === targetGroupId) return;
    const groupLayers = ids.filter((id) => layerGroupMap[id] === draggingGroup.id);
    const targetLayers = ids.filter((id) => layerGroupMap[id] === targetGroupId);
    if (groupLayers.length === 0 || targetLayers.length === 0) return;

    const fromFirst = ids.indexOf(groupLayers[0]);
    const targetFirst = ids.indexOf(targetLayers[0]);
    const groupSet = new Set(groupLayers);
    const remaining = ids.filter((id) => !groupSet.has(id));

    if (fromFirst < targetFirst) {
      const targetLastIdx = remaining.lastIndexOf(targetLayers[targetLayers.length - 1]);
      remaining.splice(targetLastIdx + 1, 0, ...groupLayers);
    } else {
      const targetFirstIdx = remaining.indexOf(targetLayers[0]);
      remaining.splice(targetFirstIdx, 0, ...groupLayers);
    }
    applyLayerOrderPreservingHidden(role, remaining);
  };

  const moveDraggedGroupOverLayer = (role: "overlay" | "basemap", targetLayerId: string, ids: string[]) => {
    if (!draggingGroup || draggingGroup.role !== role) return;
    if (layerGroupMap[targetLayerId] === draggingGroup.id) return;
    const groupLayers = ids.filter((id) => layerGroupMap[id] === draggingGroup.id);
    if (groupLayers.length === 0) return;

    const fromFirst = ids.indexOf(groupLayers[0]);
    const targetIdx = ids.indexOf(targetLayerId);
    if (targetIdx < 0) return;

    const groupSet = new Set(groupLayers);
    const remaining = ids.filter((id) => !groupSet.has(id));
    const targetInRemaining = remaining.indexOf(targetLayerId);
    if (targetInRemaining < 0) return;

    if (fromFirst < targetIdx) {
      remaining.splice(targetInRemaining + 1, 0, ...groupLayers);
    } else {
      remaining.splice(targetInRemaining, 0, ...groupLayers);
    }
    applyLayerOrderPreservingHidden(role, remaining);
  };

  const moveLayerOverGroup = (role: "overlay" | "basemap", targetGroupId: string, ids: string[]) => {
    if (!dragging || dragging.kind !== role) return;
    if (layerGroupMap[dragging.id] === targetGroupId) return;
    const targetLayers = ids.filter((id) => layerGroupMap[id] === targetGroupId);
    if (targetLayers.length === 0) return;

    const fromIdx = ids.indexOf(dragging.id);
    const targetFirst = ids.indexOf(targetLayers[0]);
    if (fromIdx < 0) return;

    const remaining = ids.filter((id) => id !== dragging.id);
    if (fromIdx < targetFirst) {
      const targetLastIdx = remaining.lastIndexOf(targetLayers[targetLayers.length - 1]);
      remaining.splice(targetLastIdx + 1, 0, dragging.id);
    } else {
      const targetFirstIdx = remaining.indexOf(targetLayers[0]);
      remaining.splice(targetFirstIdx, 0, dragging.id);
    }
    applyLayerOrderPreservingHidden(role, remaining);
  };

  const addNewSource = async () => {
    if (!newSource.base_path.trim()) return;
    await addSourceConfig({
      name: newSource.name.trim() || "Uusi karttataso",
      base_path: newSource.base_path.trim(),
      pattern: newSource.pattern.trim() || "{z}/{x}/{y}.png",
      projection: "EPSG:3857",
      role: newSource.role,
      opacity: 1,
      min_zoom: 0,
      max_zoom: Math.max(0, Math.min(24, Math.round(newSource.max_zoom))),
      attribution: newSource.attribution.trim(),
      api_type: newSource.api_type,
      tile_size: Math.max(64, Math.min(2048, Math.round(newSource.tile_size))),
      layer_name: newSource.layer_name.trim(),
      style: newSource.style.trim(),
      url: newSource.base_path.trim(),
      params: "{}",
      auth: "",
      note: "",
      view_zoom_offset: 0,
      view_magnification: 1,
    });
    await refreshSources();
    setAddOpen(false);
  };

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
    let savedView: LayerViewDraft = {
      zoomOffset: source ? Math.max(-8, Math.min(8, source.view_zoom_offset || 0)) : 0,
      magnification: source?.view_magnification === 2 || source?.view_magnification === 4 ? source.view_magnification : 1,
    };
    try {
      const parsed = JSON.parse(settings.layerViewSettings ?? "{}") as Record<string, Partial<LayerViewDraft>>;
      const value = parsed[menu.id];
      if (value && savedView.zoomOffset === 0 && savedView.magnification === 1) {
        savedView = {
          zoomOffset: Number.isFinite(value.zoomOffset) ? Math.max(-8, Math.min(8, Number(value.zoomOffset))) : 0,
          magnification: value.magnification === 2 || value.magnification === 4 ? value.magnification : 1,
        };
      }
    } catch {
      // Sivuutetaan virheellinen JSON
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
    const address = (editDraft.url || editDraft.base_path).trim();
    await updateSourceConfig(editDraft.id, {
      name: editDraft.name.trim() || "Karttataso",
      base_path: (editDraft.base_path || address).trim(),
      pattern: editDraft.pattern.trim() || "{z}/{x}/{y}.png",
      projection: editDraft.projection,
      role: editDraft.role,
      opacity: Math.min(1, Math.max(0, editDraft.opacity)),
      min_zoom: editDraft.min_zoom,
      max_zoom: Math.min(24, Math.max(0, Math.round(editDraft.max_zoom))),
      attribution: editDraft.attribution.trim(),
      api_type: editDraft.api_type,
      tile_size: Math.max(64, Math.min(2048, Math.round(editDraft.tile_size))),
      layer_name: editDraft.layer_name.trim(),
      style: editDraft.style.trim(),
      url: address,
      params: editDraft.params,
      auth: editDraft.auth,
      note: editDraft.note,
      view_zoom_offset: Math.max(-8, Math.min(8, Math.round(viewDraft.zoomOffset))),
      view_magnification: viewDraft.magnification === 2 || viewDraft.magnification === 4 ? viewDraft.magnification : 1,
    });
    await saveViewSettings(`src:${editDraft.id}`);
    await refreshSources();
    if (basemap === `src:${editDraft.id}` && editDraft.role === "overlay") {
      const fallback = sources.find((source) => source.builtin_key === "osm");
      if (fallback) setBasemap(`src:${fallback.id}`);
    }
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
      await addSourceConfig({
        ...menu.source,
        name: `${menu.source.name} (kopio)`,
        view_zoom_offset: menu.source.view_zoom_offset,
        view_magnification: menu.source.view_magnification,
      });
      await refreshSources();
    }
    setMenu(null);
  };

  const remove = async () => {
    if (!menu) return;
    if (menu.source && !menu.source.is_default && await requestConfirmation(`Poistetaanko karttataso "${menu.source.name}"?`)) {
      await deleteSource(menu.source.id);
      await refreshSources();
      if (basemap === menu.id) {
        const fallback = sources.find((source) => source.builtin_key === "osm");
        if (fallback) setBasemap(`src:${fallback.id}`);
      }
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
      <div ref={containerRef} className="relative z-[70] rounded-lg bg-white/95 dark:bg-zinc-950/95 dark:text-white text-sm shadow-lg backdrop-blur">
        <div className="flex items-center justify-between px-3 py-2">
          <button className="flex items-center gap-2 font-semibold" onClick={toggleOpenLayers}>
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
            className="fixed z-[70] max-h-[min(70vh,32rem)] w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-xs text-gray-800 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
            style={{ left: Math.max(8, actionMenu.x - 224), top: Math.min(actionMenu.y, window.innerHeight - 200) }}
          >
            <div className="mb-1 font-semibold text-gray-500 dark:text-zinc-400">Lisää uusi taso</div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                className="rounded border border-slate-300 px-2 py-1.5 hover:bg-slate-100 dark:border-gray-600 dark:hover:bg-gray-700 text-center font-medium"
                onClick={() => { setNewSource({ ...newSource, role: "basemap" }); setAddOpen(true); setActionMenu(null); }}
              >
                Pohjakartta
              </button>
              <button
                className="rounded border border-slate-300 px-2 py-1.5 hover:bg-slate-100 dark:border-gray-600 dark:hover:bg-gray-700 text-center font-medium"
                onClick={() => { setNewSource({ ...newSource, role: "overlay" }); setAddOpen(true); setActionMenu(null); }}
              >
                Päällyskartta
              </button>
            </div>
          </div>
        )}
        {openLayers && (
          <LayerList
            basemaps={visibleBasemaps}
            overlays={visibleOverlays}
            hiddenLayers={hiddenLayerItems}
            hiddenGroups={hiddenGroupItems}
            groups={groups}
            layerGroupMap={layerGroupMap}
            basemap={basemap}
            activeOverlays={overlays}
            dragging={dragging}
            draggingGroup={draggingGroup}
            missing={missing}
            onBeginDrag={beginDrag}
            onMoveDraggedLayer={moveDraggedLayer}
            onBeginDragGroup={beginDragGroup}
            onMoveDraggedGroup={moveDraggedGroup}
            onMoveDraggedGroupOverLayer={moveDraggedGroupOverLayer}
            onMoveLayerOverGroup={moveLayerOverGroup}
            onContextMenu={openMenu}
            onOpenMenu={openMenu}
            onOpenGroupMenu={openGroupMenu}
            onRestoreLayer={restoreHiddenLayer}
            onRestoreGroup={restoreGroup}
            onSetBasemap={setBasemap}
            onToggleOverlay={toggleOverlay}
          />
        )}
      </div>

      <FeaturePanel
        features={features}
        folders={folders}
        open={openFeatures}
        folderMenuOpen={folderMenuOpen}
        expandedFolderIds={expandedFolderIds}
        folderDraft={folderDraft}
        hiddenFeatureIds={hiddenFeatureIds}
        onToggleOpen={toggleOpenFeatures}
        onToggleFolderMenu={() => setFolderMenuOpen(!folderMenuOpen)}
        onFolderDraftChange={setFolderDraft}
        onAddFolder={addFolder}
        onToggleFolder={toggleFolderVisibility}
        onToggleFolderExpanded={toggleFolderExpanded}
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
      {groupMenu && (
        <>
          <div
            className="fixed inset-0 z-[75] cursor-default"
            onClick={() => setGroupMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setGroupMenu(null); }}
          />
          <div
            className="fixed z-[80] min-w-44 max-w-60 rounded-xl border border-slate-200 bg-white/95 py-1 text-xs text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100"
            style={{ left: groupMenu.x, top: groupMenu.y }}
          >
            <div className="px-3 py-1.5 font-semibold text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800/80 truncate">
              {groupMenu.name}
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
              onClick={() => hideGroup(groupMenu.id)}
            >
              <EyeOff size={14} className="text-slate-400 shrink-0" />
              <span>Piilota ryhmä</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 transition"
              onClick={() => void deleteGroup(groupMenu.id)}
            >
              <Trash2 size={14} className="shrink-0" />
              <span>Poista ryhmä</span>
            </button>
          </div>
        </>
      )}
      {menu && (
        <>
          <div
            className="fixed inset-0 z-[75] cursor-default"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}
          />
          <div
            className="fixed z-[80] min-w-48 max-w-64 rounded-xl border border-slate-200 bg-white/95 py-1 text-xs text-slate-800 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:text-zinc-100"
            style={{ left: menu.x, top: menu.y }}
          >
            <div className="px-3 py-1.5 font-semibold text-slate-500 dark:text-zinc-400 border-b border-slate-100 dark:border-zinc-800/80 truncate">
              {menu.name}
            </div>

            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
              onClick={() => { hideLayer(menu.id, menu.overlay ? "overlay" : "basemap"); setMenu(null); }}
            >
              <EyeOff size={14} className="text-slate-400 shrink-0" />
              <span>Piilota taso</span>
            </button>

            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
              onClick={() => void editSource()}
            >
              <Pencil size={14} className="text-slate-400 shrink-0" />
              <span>Muokkaa</span>
            </button>

            {/* Ryhmät alavalikko */}
            <div className="border-t border-slate-100 dark:border-zinc-800/80 my-0.5">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
                onClick={toggleGroupsMenuOpen}
              >
                <div className="flex items-center gap-2">
                  <Folder size={14} className="text-amber-500 shrink-0" />
                  <span className="font-medium">Ryhmät</span>
                </div>
                {groupsMenuOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
              </button>

              {groupsMenuOpen && (
                <div className="border-t border-slate-100 bg-slate-50/80 p-1 dark:border-zinc-800/80 dark:bg-zinc-900/60 space-y-0.5 max-h-48 overflow-y-auto">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left hover:bg-white dark:hover:bg-zinc-800 transition"
                    onClick={() => setLayerGroup(menu.id, null)}
                  >
                    <span className={!layerGroupMap[menu.id] ? "font-semibold text-blue-600 dark:text-blue-400" : ""}>
                      Ei ryhmää
                    </span>
                    {!layerGroupMap[menu.id] && <Check size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />}
                  </button>

                  {groups
                    .filter((group) => !group.role || group.role === (menu.overlay ? "overlay" : "basemap"))
                    .map((group) => {
                    const isSelected = layerGroupMap[menu.id] === group.id;
                    return (
                      <button
                        key={group.id}
                        type="button"
                        className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left hover:bg-white dark:hover:bg-zinc-800 transition"
                        onClick={() => setLayerGroup(menu.id, group.id)}
                      >
                        <span className={`truncate ${isSelected ? "font-semibold text-blue-600 dark:text-blue-400" : ""}`}>
                          {group.name}
                        </span>
                        {isSelected && <Check size={13} className="text-blue-600 dark:text-blue-400 shrink-0" />}
                      </button>
                    );
                  })}

                  <div className="border-t border-slate-200 dark:border-zinc-700/60 pt-1 mt-1">
                    {newGroupModalOpen ? (
                      <div className="p-1 space-y-1.5">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Uuden ryhmän nimi"
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none dark:border-zinc-700 dark:bg-zinc-900 text-slate-900 dark:text-white"
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              createGroup(newGroupName, menu.id, menu.overlay ? "overlay" : "basemap");
                              setNewGroupName("");
                              setNewGroupModalOpen(false);
                            } else if (e.key === "Escape") {
                              setNewGroupModalOpen(false);
                            }
                          }}
                        />
                        <div className="flex gap-1 justify-end">
                          <button
                            type="button"
                            className="rounded px-2 py-0.5 text-[11px] text-slate-500 hover:bg-slate-200 dark:hover:bg-zinc-800"
                            onClick={() => setNewGroupModalOpen(false)}
                          >
                            Peruuta
                          </button>
                          <button
                            type="button"
                            className="rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700"
                            onClick={() => {
                              createGroup(newGroupName, menu.id, menu.overlay ? "overlay" : "basemap");
                              setNewGroupName("");
                              setNewGroupModalOpen(false);
                            }}
                          >
                            Luo ryhmä
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40 font-medium transition"
                        onClick={() => setNewGroupModalOpen(true)}
                      >
                        <Plus size={13} />
                        <span>Uusi ryhmä...</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {menu.source && !menu.source.is_default && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-600 hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
                onClick={() => void remove()}
              >
                <Trash2 size={14} className="shrink-0" />
                <span>Poista</span>
              </button>
            )}
            {menu.source?.is_default && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
                onClick={async () => {
                  await resetSourceToDefault(menu.source!.id);
                  await refreshSources();
                  setMenu(null);
                }}
              >
                <RotateCcw size={14} className="text-slate-400 shrink-0" />
                <span>Palauta oletus</span>
              </button>
            )}
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-zinc-800/70 transition"
              onClick={() => void duplicate()}
            >
              <Copy size={14} className="text-slate-400 shrink-0" />
              <span>Monista</span>
            </button>
          </div>
        </>
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