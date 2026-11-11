import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import { lantmaterietTileUrl, tileUrl, type LocalSource } from "../../services/tauriBridge";

type Settings = Record<string, string>;
export interface LayerDef {
  id: string;
  name: string;
  needs?: "mmlKey" | "lantmaterietUsername" | "owmKey";
  note?: string;
  create: (s: Settings) => TileLayer<XYZ>;
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

const MML = (layer: string, ext: string, key: string) =>
  `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/${layer}/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.${ext}?api-key=${key}`;
const MML_ATTR = "© Maanmittauslaitos";

export const BASEMAPS: LayerDef[] = [
  { id: "osm", name: "OpenStreetMap", create: () => xyz("https://tile.openstreetmap.org/{z}/{x}/{y}.png", "© OpenStreetMap-tekijät") },
  { id: "g-sat", name: "Google Satelliitti", note: "Epävirallinen tile-osoite", create: () => xyz("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", "© Google", 20) },
  { id: "g-hyb", name: "Google Hybridi", note: "Epävirallinen tile-osoite", create: () => xyz("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", "© Google", 20) },
  { id: "g-ter", name: "Google Maasto", note: "Epävirallinen tile-osoite", create: () => xyz("https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", "© Google", 20) },
  { id: "mml-maasto", name: "MML Maastokartta", needs: "mmlKey", create: (s) => xyz(MML("maastokartta", "png", s.mmlKey), MML_ATTR) },
  { id: "mml-tausta", name: "MML Taustakartta", needs: "mmlKey", create: (s) => xyz(MML("taustakartta", "png", s.mmlKey), MML_ATTR) },
  { 
    id: "lantmateriet-topo", 
    name: "Lantmäteriet Topo", 
    needs: "lantmaterietUsername",
    note: "Lantmäteriet-sähköposti ja salasana vaaditaan",
    create: () => xyz(lantmaterietTileUrl(), "© Lantmäteriet", 14)
  },
];

export const OVERLAYS: LayerDef[] = [
  { id: "g-roads", name: "Google Tiet & paikannimet", note: "Epävirallinen tile-osoite", create: () => xyz("https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}", "© Google", 20) },
  { id: "orm", name: "OpenRailwayMap", create: () => xyz("https://{a-c}.tile.openrailwaymap.org/standard/{z}/{x}/{y}.png", "© OpenRailwayMap, © OSM") },
  { id: "mml-kiinteisto", name: "MML Kiinteistörajat", needs: "mmlKey", note: "Tasonimi tarkistettava MML:n WMTS-capabilitiesista", create: (s) => xyz(MML("kiinteistojaotus", "png", s.mmlKey), MML_ATTR) },
  { id: "owm-rain", name: "Sadetutka (OpenWeatherMap)", needs: "owmKey", create: (s) => xyz(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${s.owmKey}`, "© OpenWeatherMap", 12) },
];

export function buildLayer(id: string, s: Settings, sources: LocalSource[], overlay: boolean): TileLayer<XYZ> | null {
  if (id.startsWith("local:")) {
    const src = sources.find((x) => `local:${x.id}` === id);
    return src ? xyz(tileUrl(src.id), src.name) : null;
  }
  const def = (overlay ? OVERLAYS : BASEMAPS).find((d) => d.id === id);
  if (!def) return null;
  if (def.needs && !s[def.needs]) return null;
  const l = def.create(s);
  if (overlay) l.setOpacity(0.9);
  return l;
}