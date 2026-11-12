import type { LayerDef } from "../model/layerTypes";
import { createMmlLayer, createRemoteTileLayer } from "./layerProviders";

export const OVERLAYS: LayerDef[] = [
  { id: "g-roads", name: "Google Tiet & paikannimet", note: "Epävirallinen tile-osoite", create: () => createRemoteTileLayer("https://mt1.google.com/vt/lyrs=h&x={x}&y={y}&z={z}", "© Google", 20) },
  { id: "orm", name: "OpenRailwayMap – rautatiet", create: () => createRemoteTileLayer("https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png", "© OpenRailwayMap, © OpenStreetMap", 19) },
  { id: "orm-signals", name: "OpenRailwayMap – opastimet", create: () => createRemoteTileLayer("https://tiles.openrailwaymap.org/signals/{z}/{x}/{y}.png", "© OpenRailwayMap, © OpenStreetMap", 19) },
  { id: "orm-speed", name: "OpenRailwayMap – nopeudet", create: () => createRemoteTileLayer("https://tiles.openrailwaymap.org/maxspeed/{z}/{x}/{y}.png", "© OpenRailwayMap, © OpenStreetMap", 19) },
  { id: "mml-kiinteisto", name: "MML Kiinteistörajat", needs: "mmlKey", note: "Tasonimi tarkistettava MML:n WMTS-capabilitiesista", create: (settings) => createMmlLayer("kiinteistojaotus", "png", settings.mmlKey, 16) },
  { id: "mml-kiinteistotunnukset", name: "MML Kiinteistötunnukset", needs: "mmlKey", create: (settings) => createMmlLayer("kiinteistotunnukset", "png", settings.mmlKey, 16) },
  { id: "mml-kuntarajat", name: "MML Kuntarajat", needs: "mmlKey", create: (settings) => createMmlLayer("kuntarajat", "png", settings.mmlKey, 15) },
  { id: "mml-paikannimet", name: "MML Paikannimet", needs: "mmlKey", create: (settings) => createMmlLayer("paikannimet", "png", settings.mmlKey, 15) },
  { id: "mml-hydrografia", name: "MML Vesistöt", needs: "mmlKey", create: (settings) => createMmlLayer("hydrografia", "png", settings.mmlKey, 15) },
  { id: "mml-rinnevarjoste", name: "MML Rinnevarjoste", needs: "mmlKey", create: (settings) => createMmlLayer("korkeusmalli_vinovalo", "png", settings.mmlKey, 15) },
  { id: "owm-rain", name: "Sadetutka (OpenWeatherMap)", needs: "owmKey", create: (settings) => createRemoteTileLayer(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${settings.owmKey}`, "© OpenWeatherMap", 12) },
];
