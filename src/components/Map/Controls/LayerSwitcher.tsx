import { Layers, Bookmark, GripVertical, Plus } from "lucide-react";
import { useState, useEffect, type MouseEvent, type DragEvent } from "react";
import { useMapStore, type LayerCopy } from "../../../store/mapStore";
import { BASEMAPS, OVERLAYS } from "../layers";
import { addSource, deleteFeature, deleteSource, listFeatures, updateSource, type LocalSource, type UserFeature } from "../../../services/tauriBridge";

type LayerViewDraft = { zoomOffset: number; magnification: number };

export default function LayerSwitcher() {
  const [openLayers, setOpenLayers] = useState(true);
  const [openFeatures, setOpenFeatures] = useState(true);
  const { basemap, overlays, overlayOrder, basemapOrder, sources, layerCopies, settings, setBasemap, toggleOverlay, setLayerOrder, duplicateLayer, deleteLayerCopy, reloadSources: refreshSources, featuresVersion, bumpFeatures } = useMapStore();
  const [features, setFeatures] = useState<UserFeature[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string; name: string; source?: LocalSource; copy?: LayerCopy; overlay: boolean } | null>(null);
  const [editDraft, setEditDraft] = useState<LocalSource | null>(null);
  const [editLayer, setEditLayer] = useState<{ id: string; name: string; overlay: boolean } | null>(null);
  const [selectedBasemap, setSelectedBasemap] = useState(basemap);
  const [apiDraft, setApiDraft] = useState<Record<string, string>>({});
  const [viewDraft, setViewDraft] = useState<LayerViewDraft>({ zoomOffset: 0, magnification: 1 });
  const [addOpen, setAddOpen] = useState(false);
  const [newSource, setNewSource] = useState({
    name: "", base_path: "", pattern: "{z}/{x}/{y}.png", role: "overlay" as LocalSource["role"],
    api_type: "tile" as LocalSource["api_type"], tile_size: 256, max_zoom: 19, layer_name: "", style: "", attribution: "",
  });

  const missing = (needs?: string) => needs && !settings[needs];

  useEffect(() => {
    listFeatures().then(setFeatures);
  }, [featuresVersion]);

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

  const beginDrag = (event: DragEvent, id: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  };

  const dropLayer = (event: DragEvent, kind: "overlay" | "basemap", targetId: string, ids: string[]) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === targetId) return;
    const order = [...ids];
    const from = order.indexOf(sourceId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, sourceId);
    setLayerOrder(kind, order);
  };

  const allowDrop = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
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
      deleteLayerCopy(menu.copy.id);
    } else if (menu.source && window.confirm(`Poistetaanko karttataso "${menu.source.name}"?`)) {
      await deleteSource(menu.source.id);
      await refreshSources();
      if (basemap === menu.id) setBasemap("osm");
    }
    setMenu(null);
  };

  return (
    <>
      <div className="absolute left-2 top-2 z-10 flex w-[min(16rem,calc(100vw-1rem))] flex-col gap-2 sm:left-3 sm:top-3">
      {/* Karttatasot */}
      <div className="rounded-lg bg-white/95 dark:bg-gray-800/95 dark:text-white text-sm shadow-lg backdrop-blur">
        <div className="flex items-center justify-between px-3 py-2">
          <button className="flex items-center gap-2 font-semibold" onClick={() => setOpenLayers(!openLayers)}>
            <Layers size={16} /> Karttatasot
          </button>
          <button className="rounded p-1 text-[#1671a8] hover:bg-slate-100" title="Lisää karttataso" onClick={() => setAddOpen(true)}><Plus size={18} /></button>
        </div>
        {openLayers && (
          <div className="max-h-[35vh] overflow-y-auto border-t px-2 py-2 dark:border-gray-700 sm:px-3">
            <div className="mb-1 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Taustakartta</div>
            {allBasemaps.map((b) => (
              <div key={b.id} onDragOver={allowDrop} onDrop={(e) => dropLayer(e, "basemap", b.id, allBasemaps.map((item) => item.id))} onContextMenu={(e) => openMenu(e, b.id, b.name, false, "source" in b ? b.source : undefined, "copy" in b ? b.copy : undefined)} className={`flex items-center gap-2 py-1 ${missing(b.needs) ? "opacity-40" : ""}`} title={missing(b.needs) ? "Lisää API-avain asetuksissa" : b.note}>
                <span draggable onDragStart={(e) => beginDrag(e, b.id)} className="cursor-grab touch-none text-slate-400"><GripVertical size={14} /></span>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"><input type="radio" name="base" checked={basemap === b.id} onChange={() => setBasemap(b.id)} /><span className="truncate">{b.name}</span></label>
              </div>
            ))}
            <div className="mb-1 mt-3 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">Päällykset</div>
            {allOverlays.map((o) => (
              <div key={o.id} onDragOver={allowDrop} onDrop={(e) => dropLayer(e, "overlay", o.id, allOverlays.map((item) => item.id))} onContextMenu={(e) => openMenu(e, o.id, o.name, true, "source" in o ? o.source : undefined, "copy" in o ? o.copy : undefined)} className={`flex items-center gap-2 py-1 ${missing(o.needs) ? "opacity-40" : ""}`} title={missing(o.needs) ? "Lisää API-avain asetuksissa" : o.note}>
                <span draggable onDragStart={(e) => beginDrag(e, o.id)} className="cursor-grab touch-none text-slate-400"><GripVertical size={14} /></span>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"><input type="checkbox" checked={overlays.includes(o.id)} onChange={() => toggleOverlay(o.id)} /><span className="truncate">{o.name}</span></label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tallennetut mittaukset / merkinnät */}
      <div className="rounded-lg bg-white/95 dark:bg-gray-800/95 dark:text-white text-sm shadow-lg backdrop-blur">
        <button className="flex w-full items-center gap-2 px-3 py-2 font-semibold" onClick={() => setOpenFeatures(!openFeatures)}>
          <Bookmark size={16} /> Tallennetut mittaukset ({features.length})
        </button>
        {openFeatures && (
          <div className="max-h-[30vh] overflow-y-auto border-t dark:border-gray-700 px-3 py-2 space-y-1">
            {features.length === 0 ? (
              <div className="text-xs text-gray-400 py-1">Ei tallennettuja mittauksia.</div>
            ) : (
              features.map((f) => (
                <div key={f.id} className="flex items-center justify-between text-xs py-1 border-b dark:border-gray-700 last:border-none">
                  <span className="truncate pr-2 font-medium">{f.title}</span>
                  <button 
                    className="text-red-500 hover:text-red-700 text-[10px]"
                    onClick={async () => {
                      if (confirm(`Haluatko varmasti poistaa merkinnän "${f.title}"?`)) {
                        await deleteFeature(f.id);
                        bumpFeatures();
                      }
                    }}
                  >
                    Poista
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      </div>
      {addOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && setAddOpen(false)}>
          <div className="max-h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-2xl sm:p-5">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="text-lg font-semibold text-[#164b73]">Lisää karttataso</div>
              <button className="text-xl text-slate-400" onClick={() => setAddOpen(false)}>×</button>
            </div>
            <div className="grid gap-3">
              <label>Nimi<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={newSource.name} onChange={(e) => setNewSource({ ...newSource, name: e.target.value })} /></label>
              <label>Osoite, kansio tai MBTiles-tiedosto<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={newSource.base_path} onChange={(e) => setNewSource({ ...newSource, base_path: e.target.value })} /></label>
              <label>Laatan polku / URL-malli<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs" value={newSource.pattern} onChange={(e) => setNewSource({ ...newSource, pattern: e.target.value })} /></label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label>API-tyyppi<select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={newSource.api_type} onChange={(e) => setNewSource({ ...newSource, api_type: e.target.value as LocalSource["api_type"] })}><option value="tile">Tile Map API</option><option value="wmts">WMTS API</option><option value="wms">WMS API</option><option value="vector">Vector Tile API</option></select></label>
                <label>Käyttö<select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={newSource.role} onChange={(e) => setNewSource({ ...newSource, role: e.target.value as LocalSource["role"] })}><option value="basemap">Pohjakartta</option><option value="overlay">Päällys</option></select></label>
                <label>Laatan koko<input type="number" min="64" max="2048" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={newSource.tile_size} onChange={(e) => setNewSource({ ...newSource, tile_size: Number(e.target.value) })} /></label>
                <label>Maksimizo<input type="number" min="0" max="24" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={newSource.max_zoom} onChange={(e) => setNewSource({ ...newSource, max_zoom: Number(e.target.value) })} /></label>
              </div>
              <label>Layer / taso<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={newSource.layer_name} onChange={(e) => setNewSource({ ...newSource, layer_name: e.target.value })} /></label>
              <label>Tyyli<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={newSource.style} onChange={(e) => setNewSource({ ...newSource, style: e.target.value })} /></label>
              <label>Lähde / attribution<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={newSource.attribution} onChange={(e) => setNewSource({ ...newSource, attribution: e.target.value })} /></label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded border border-slate-300 px-4 py-2" onClick={() => setAddOpen(false)}>Peruuta</button>
              <button className="rounded bg-[#1671a8] px-4 py-2 font-medium text-white disabled:opacity-50" disabled={!newSource.base_path.trim()} onClick={() => void addNewSource()}>Lisää</button>
            </div>
          </div>
        </div>
      )}
      {menu && (
        <div
          className="fixed z-[80] min-w-44 rounded-lg border border-gray-200 bg-white py-1 text-xs text-gray-800 shadow-xl dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          style={{ left: menu.x, top: menu.y }}
          onMouseLeave={() => setMenu(null)}
        >
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
      {(editDraft || editLayer) && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && (setEditDraft(null), setEditLayer(null))}>
          <div className="max-h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] max-w-lg overflow-x-hidden overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-2xl sm:p-5">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-lg font-semibold text-[#164b73]">Muokkaa karttatasoa</div>
                <div className="text-xs text-slate-500">Muokkaa tason ominaisuuksia kuten Min Karta -sovelluksessa.</div>
              </div>
              <button className="text-xl text-slate-400 hover:text-slate-700" onClick={() => { setEditDraft(null); setEditLayer(null); }}>×</button>
            </div>
            <div className="grid gap-3">
              {editLayer && (
                <>
                  {!editLayer.overlay && <label>Taustakartta
                    <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={selectedBasemap} onChange={(e) => setSelectedBasemap(e.target.value)}>
                      {BASEMAPS.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
                    </select>
                  </label>}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 font-semibold text-[#164b73]">Karttatason API-asetukset</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label>API-tyyppi<input disabled className="mt-1 w-full rounded border border-slate-300 bg-slate-100 px-2 py-1.5" value={editLayer.id.includes("mml") || editLayer.id.includes("lantmateriet") ? "WMTS API" : "Tile Map API"} /></label>
                      <label>Laatan koko<input disabled className="mt-1 w-full rounded border border-slate-300 bg-slate-100 px-2 py-1.5" value="256" /></label>
                      <label>Layer / taso<input disabled className="mt-1 w-full rounded border border-slate-300 bg-slate-100 px-2 py-1.5" value={editLayer.name} /></label>
                      <label>Maksimizo<input disabled className="mt-1 w-full rounded border border-slate-300 bg-slate-100 px-2 py-1.5" value="Lähdekoodissa määritelty" /></label>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">Sisäänrakennetun tason osoite ja tekniset parametrit tulevat lähdekoodin karttakatalogista.</div>
                  </div>
                </>
              )}
              {editDraft && <>
              <label>Karttatason nimi<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} /></label>
              <label>Osoite, kansio tai MBTiles-tiedosto<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={editDraft.base_path} onChange={(e) => setEditDraft({ ...editDraft, base_path: e.target.value })} /></label>
              <label>Laatan polku<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs" value={editDraft.pattern} onChange={(e) => setEditDraft({ ...editDraft, pattern: e.target.value })} /></label>
              <label>Rajapinnan tyyppi
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={editDraft.api_type} onChange={(e) => setEditDraft({ ...editDraft, api_type: e.target.value as LocalSource["api_type"] })}>
                  <option value="tile">Tile Map API</option><option value="wmts">WMTS API</option><option value="wms">WMS API</option><option value="vector">Vector Tile API</option>
                </select>
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label>Laatan koko<input type="number" min="64" max="2048" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={editDraft.tile_size} onChange={(e) => setEditDraft({ ...editDraft, tile_size: Number(e.target.value) })} /></label>
                <label>Layer / taso<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={editDraft.layer_name} onChange={(e) => setEditDraft({ ...editDraft, layer_name: e.target.value })} /></label>
              </div>
              <label>Tyyli<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={editDraft.style} onChange={(e) => setEditDraft({ ...editDraft, style: e.target.value })} /></label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label>Tason käyttö
                  <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={editDraft.role} onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value as LocalSource["role"] })}>
                    <option value="basemap">Pohjakartta</option>
                    <option value="overlay">Päällys</option>
                  </select>
                </label>
                <label>Maksimizo <input type="number" min="0" max="24" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={editDraft.max_zoom} onChange={(e) => setEditDraft({ ...editDraft, max_zoom: Number(e.target.value) })} /></label>
              </div>
              <label>Läpinäkyvyys: {Math.round(editDraft.opacity * 100)}%
                <input type="range" min="0" max="1" step="0.05" className="mt-2 w-full accent-[#1671a8]" value={editDraft.opacity} onChange={(e) => setEditDraft({ ...editDraft, opacity: Number(e.target.value) })} />
              </label>
              <label>Tekijänoikeus / lähde<input className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={editDraft.attribution} onChange={(e) => setEditDraft({ ...editDraft, attribution: e.target.value })} /></label>
              </>}
              <div className="border-t border-slate-200 pt-3">
                <div className="mb-2 font-semibold text-[#164b73]">Zoomaus ja suurennus</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label>Zoom offset
                    <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={viewDraft.zoomOffset} onChange={(e) => setViewDraft({ ...viewDraft, zoomOffset: Number(e.target.value) })}>
                      {[-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((value) => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
                    </select>
                  </label>
                  <label>Suurennus
                    <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={viewDraft.magnification} onChange={(e) => setViewDraft({ ...viewDraft, magnification: Number(e.target.value) })}>
                      <option value={1}>1x</option>
                      <option value={2}>2x</option>
                      <option value={4}>4x</option>
                    </select>
                  </label>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">Positiivinen offset siirtää aineiston alemmalta zoomilta ylemmälle karttazoomille: +4 tarkoittaa rasterin z13 kartan z17:ssa.</div>
              </div>
              <div className="border-t border-slate-200 pt-3">
                <div className="mb-2 font-semibold text-[#164b73]">Rajapinta-asetukset</div>
                {[
                  ["mmlKey", "Maanmittauslaitoksen API-avain"],
                  ["lantmaterietUsername", "Lantmäteriet käyttäjätunnus"],
                  ["lantmaterietPassword", "Lantmäteriet salasana"],
                  ["owmKey", "OpenWeatherMap API-avain"],
                ].map(([key, label]) => (
                  <label key={key} className="mb-2 block text-xs">{label}
                    <input type={key.toLowerCase().includes("password") || key.toLowerCase().includes("key") ? "password" : "text"} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" value={apiDraft[key] ?? ""} onChange={(e) => setApiDraft({ ...apiDraft, [key]: e.target.value })} />
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded border border-slate-300 px-4 py-2" onClick={() => { setEditDraft(null); setEditLayer(null); }}>Peruuta</button>
              <button className="rounded bg-[#1671a8] px-4 py-2 font-medium text-white hover:bg-[#125d8c]" onClick={() => void (editDraft ? saveSource() : saveLayerEdit())}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}