import { useState } from "react";
import { useMapStore } from "../../../store/mapStore";
import { addSourceConfig, deleteSource, resetSourceToDefault, updateSourceConfig, type LocalSource } from "../../../infrastructure/tauri";
import { requestConfirmation } from "../../../app/confirmation";
import type { NewLayerSource } from "../components/AddLayerModal";
import type { LayerViewDraft } from "../model/layerViewTypes";

export interface LayerContextMenuState {
  x: number;
  y: number;
  id: string;
  name: string;
  source?: LocalSource;
  overlay: boolean;
}

interface UseLayerCrudOptions {
  sources: LocalSource[];
  settings: Record<string, string>;
  basemap: string;
  overlays: string[];
  setBasemap: (id: string) => void;
  toggleOverlay: (id: string) => void;
  refreshSources: () => Promise<void>;
  menu: LayerContextMenuState | null;
  setMenu: (menu: LayerContextMenuState | null) => void;
}

export function useLayerCrud({
  sources,
  settings,
  basemap,
  overlays,
  setBasemap,
  toggleOverlay,
  refreshSources,
  menu,
  setMenu,
}: UseLayerCrudOptions) {
  const [editDraft, setEditDraft] = useState<LocalSource | null>(null);
  const [viewDraft, setViewDraft] = useState<LayerViewDraft>({ zoomOffset: 0, magnification: 1 });
  const [addOpen, setAddOpen] = useState(false);
  const [newSource, setNewSource] = useState<NewLayerSource>({
    name: "",
    base_path: "",
    pattern: "{z}/{x}/{y}.png",
    role: "overlay",
    api_type: "local_tile",
    tile_size: 256,
    max_zoom: 19,
    layer_name: "",
    style: "",
    attribution: "",
  });

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

  const editSource = async () => {
    if (!menu) return;
    const source = menu.source;
    const targetId = menu.id;
    setMenu(null);
    let savedView: LayerViewDraft = {
      zoomOffset: source ? Math.max(-8, Math.min(8, source.view_zoom_offset || 0)) : 0,
      magnification: source?.view_magnification === 2 || source?.view_magnification === 4 ? source.view_magnification : 1,
    };
    try {
      const parsed = JSON.parse(settings.layerViewSettings ?? "{}") as Record<string, Partial<LayerViewDraft>>;
      const value = parsed[targetId];
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
      layerViewSettings: JSON.stringify(all),
    });
  };

  const saveSource = async () => {
    if (!editDraft) return;
    const isLocal = editDraft.api_type === "local_tile";
    const base_path = isLocal ? editDraft.base_path.trim() : "";
    const url = isLocal ? "" : editDraft.url.trim();
    await updateSourceConfig(editDraft.id, {
      name: editDraft.name.trim() || "Karttataso",
      base_path,
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
      url,
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
    } else if (editDraft.role === "basemap" && overlays.includes(`src:${editDraft.id}`)) {
      toggleOverlay(`src:${editDraft.id}`);
    }
    setEditDraft(null);
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

  const resetDefault = async () => {
    if (!menu?.source) return;
    await resetSourceToDefault(menu.source.id);
    await refreshSources();
    setMenu(null);
  };

  return {
    editDraft,
    setEditDraft,
    viewDraft,
    setViewDraft,
    addOpen,
    setAddOpen,
    newSource,
    setNewSource,
    addNewSource,
    editSource,
    saveSource,
    duplicate,
    remove,
    resetDefault,
  };
}
