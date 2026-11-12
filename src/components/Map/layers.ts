import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import TileGrid from "ol/tilegrid/TileGrid";
import { get as getProjection } from "ol/proj";
import ImageTile from "ol/ImageTile";
import type Tile from "ol/Tile";
import { fetchLantmaterietTile, inTauri, lantmaterietTileUrl, tileUrl, type LocalSource } from "../../services/tauriBridge";
import type { LayerCopy } from "../../store/mapStore";

type Settings = Record<string, string>;
export interface LayerDef {
  id: string;
  name: string;
  needs?: "mmlKey" | "lantmaterietUsername" | "owmKey";
  note?: string;
  create: (s: Settings) => TileLayer<any>;
}

const xyz = (url: string, attributions?: string, maxZoom = 19) =>
  new TileLayer({
    source: new XYZ({
      url,
      attributions,
      maxZoom,
      crossOrigin: "anonymous",
    }),
  });

const local = (source: LocalSource): TileLayer<any> => {
  if (source.api_type === "wms") {
    const layer = new TileLayer({
      source: new TileWMS({
        url: source.base_path,
        params: { LAYERS: source.layer_name, STYLES: source.style, TILED: true },
        attributions: source.attribution || source.name,
        crossOrigin: "anonymous",
      }),
    });
    layer.setOpacity(source.opacity);
    return layer;
  }
  const layer = new TileLayer({
    source: new XYZ({
      url: tileUrl(source.id),
      attributions: source.attribution || source.name,
      maxZoom: source.max_zoom,
      tileSize: source.tile_size,
      crossOrigin: "anonymous",
    }),
  });
  layer.setOpacity(source.opacity);
  return layer;
};

const lantmateriet = () =>
  new TileLayer({
    source: new XYZ({
      url: "https://lantmateriet.invalid/{z}/{x}/{y}.png",
      attributions: "© Lantmäteriet",
      maxZoom: 14,
      crossOrigin: "anonymous",
      tileLoadFunction: (tile: Tile, src: string) => {
        const image = (tile as ImageTile).getImage() as HTMLImageElement;
        if (!inTauri()) {
          image.src = lantmaterietTileUrl();
          return;
        }
        const match = src.match(/\/(\d+)\/(\d+)\/(-?\d+)\.png$/);
        if (!match) {
          image.dispatchEvent(new Event("error"));
          return;
        }
        const [, z, x, y] = match;
        void fetchLantmaterietTile(Number(z), Number(x), Number(y))
          .then((bytes) => {
            const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
            image.onload = () => URL.revokeObjectURL(objectUrl);
            image.src = objectUrl;
          })
          .catch(() => image.dispatchEvent(new Event("error")));
      },
    }),
  });

const MML = (layer: string, ext: string, key: string) =>
  `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/${layer}/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.${ext}?api-key=${key}`;
const MML_ATTR = "© Maanmittauslaitos";

type LayerViewSettings = { zoomOffset: number; magnification: number };

const getLayerViewSettings = (id: string, settings: Settings): LayerViewSettings => {
  try {
    const parsed = JSON.parse(settings.layerViewSettings ?? "{}") as Record<string, Partial<LayerViewSettings>>;
    const value = parsed[id];
    return {
      zoomOffset: Number.isFinite(value?.zoomOffset) ? Math.max(-8, Math.min(8, value.zoomOffset!)) : 0,
      magnification: value?.magnification === 2 || value?.magnification === 4 ? value.magnification : 1,
    };
  } catch {
    return { zoomOffset: 0, magnification: 1 };
  }
};

const applyLayerViewSettings = (layer: TileLayer<any>, id: string, settings: Settings) => {
  const view = getLayerViewSettings(id, settings);
  const source = layer.getSource();
  if (!source) return layer;
  const projection = getProjection("EPSG:3857");
  if (!projection) return layer;
  const tileGrid = source.getTileGridForProjection(projection);
  const maxZoom = tileGrid?.getResolutions().length ? tileGrid.getResolutions().length - 1 : 19;
  const effectiveOffset = view.zoomOffset - Math.log2(view.magnification);
  const initialResolution = 156543.03392804097;
  const resolutions = Array.from(
    { length: maxZoom + 1 },
    (_, z) => initialResolution / (2 ** (z + effectiveOffset)),
  );
  source.setTileGridForProjection(
    projection,
    new TileGrid({
      origin: [-20037508.342789244, 20037508.342789244],
      resolutions,
      tileSize: 256,
    }),
  );
  return layer;
};

export const BASEMAPS: LayerDef[] = [
  { id: "osm", name: "OpenStreetMap", create: () => xyz("https://tile.openstreetmap.org/{z}/{x}/{y}.png", "© OpenStreetMap-tekijät") },
  { id: "g-sat", name: "Google Satelliitti", note: "Epävirallinen tile-osoite", create: () => xyz("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", "© Google", 20) },
  { id: "g-hyb", name: "Google Hybridi", note: "Epävirallinen tile-osoite", create: () => xyz("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", "© Google", 20) },
  { id: "g-ter", name: "Google Maasto", note: "Epävirallinen tile-osoite", create: () => xyz("https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", "© Google", 20) },
  { id: "mml-maasto", name: "MML Maastokartta", needs: "mmlKey", create: (s) => xyz(MML("maastokartta", "png", s.mmlKey), MML_ATTR, 16) },
  { id: "mml-tausta", name: "MML Taustakartta", needs: "mmlKey", create: (s) => xyz(MML("taustakartta", "png", s.mmlKey), MML_ATTR, 16) },
  { id: "mml-selkokartta", name: "MML Selkokartta", needs: "mmlKey", create: (s) => xyz(MML("selkokartta", "png", s.mmlKey), MML_ATTR, 16) },
  { id: "mml-ortokuva", name: "MML Ortokuva", needs: "mmlKey", create: (s) => xyz(MML("ortokuva", "jpg", s.mmlKey), MML_ATTR, 16) },
  { 
    id: "lantmateriet-topo", 
    name: "Lantmäteriet Topo", 
    needs: "lantmaterietUsername",
    note: "Lantmäteriet-sähköposti ja salasana vaaditaan",
    create: () => lantmateriet()
  },
];

export const OVERLAYS: LayerDef[] = [
  { id: "g-roads", name: "Google Tiet & paikannimet", note: "Epävirallinen tile-osoite", create: () => xyz("https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}", "© Google", 20) },
  { id: "orm", name: "OpenRailwayMap – rautatiet", create: () => xyz("https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png", "© OpenRailwayMap, © OpenStreetMap", 19) },
  { id: "orm-signals", name: "OpenRailwayMap – opastimet", create: () => xyz("https://tiles.openrailwaymap.org/signals/{z}/{x}/{y}.png", "© OpenRailwayMap, © OpenStreetMap", 19) },
  { id: "orm-speed", name: "OpenRailwayMap – nopeudet", create: () => xyz("https://tiles.openrailwaymap.org/maxspeed/{z}/{x}/{y}.png", "© OpenRailwayMap, © OpenStreetMap", 19) },
  { id: "mml-kiinteisto", name: "MML Kiinteistörajat", needs: "mmlKey", note: "Tasonimi tarkistettava MML:n WMTS-capabilitiesista", create: (s) => xyz(MML("kiinteistojaotus", "png", s.mmlKey), MML_ATTR, 16) },
  { id: "mml-kiinteistotunnukset", name: "MML Kiinteistötunnukset", needs: "mmlKey", create: (s) => xyz(MML("kiinteistotunnukset", "png", s.mmlKey), MML_ATTR, 16) },
  { id: "mml-kuntarajat", name: "MML Kuntarajat", needs: "mmlKey", create: (s) => xyz(MML("kuntarajat", "png", s.mmlKey), MML_ATTR, 15) },
  { id: "mml-paikannimet", name: "MML Paikannimet", needs: "mmlKey", create: (s) => xyz(MML("paikannimet", "png", s.mmlKey), MML_ATTR, 15) },
  { id: "mml-hydrografia", name: "MML Vesistöt", needs: "mmlKey", create: (s) => xyz(MML("hydrografia", "png", s.mmlKey), MML_ATTR, 15) },
  { id: "mml-rinnevarjoste", name: "MML Rinnevarjoste", needs: "mmlKey", create: (s) => xyz(MML("korkeusmalli_vinovalo", "png", s.mmlKey), MML_ATTR, 15) },
  { id: "owm-rain", name: "Sadetutka (OpenWeatherMap)", needs: "owmKey", create: (s) => xyz(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${s.owmKey}`, "© OpenWeatherMap", 12) },
];

export const LAYER_CATALOG = {
  basemaps: BASEMAPS,
  overlays: OVERLAYS,
} as const;

export function buildLayer(id: string, s: Settings, sources: LocalSource[], overlay: boolean): TileLayer<any> | null {
  if (id.startsWith("copy:")) {
    let copies: LayerCopy[] = [];
    try {
      const parsed = JSON.parse(s.layerCopies ?? "[]");
      if (Array.isArray(parsed)) copies = parsed;
    } catch {
      copies = [];
    }
    const copy = copies.find((item) => `copy:${item.id}` === id);
    if (!copy) return null;
    const sourceIsOverlay = OVERLAYS.some((layer) => layer.id === copy.sourceId);
    const copied = buildLayer(copy.sourceId, s, sources, sourceIsOverlay);
    if (copied) {
      copied.setOpacity(copy.opacity);
      return applyLayerViewSettings(copied, id, s);
    }
    return null;
  }
  if (id.startsWith("local:")) {
    const src = sources.find((x) => `local:${x.id}` === id);
    if (!src || (overlay && src.role !== "overlay") || (!overlay && src.role !== "basemap")) return null;
    return applyLayerViewSettings(local(src), id, s);
  }
  const def = LAYER_CATALOG[overlay ? "overlays" : "basemaps"].find((d) => d.id === id);
  if (!def) return null;
  if (def.needs && !s[def.needs]) return null;
  const l = def.create(s);
  if (overlay && !id.startsWith("local:")) l.setOpacity(0.9);
  return applyLayerViewSettings(l, id, s);
}