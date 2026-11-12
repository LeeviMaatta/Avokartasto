import type { LayerDef } from "../model/layerTypes";
import { createMmlLayer, createRemoteTileLayer, createLantmaterietLayer } from "./layerProviders";

export const BASEMAPS: LayerDef[] = [
  { id: "osm", name: "OpenStreetMap", create: () => createRemoteTileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", "© OpenStreetMap-tekijät") },
  { id: "g-sat", name: "Google Satelliitti", note: "Epävirallinen tile-osoite", create: () => createRemoteTileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", "© Google", 20) },
  { id: "g-hyb", name: "Google Hybridi", note: "Epävirallinen tile-osoite", create: () => createRemoteTileLayer("https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", "© Google", 20) },
  { id: "g-ter", name: "Google Maasto", note: "Epävirallinen tile-osoite", create: () => createRemoteTileLayer("https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}", "© Google", 20) },
  { id: "mml-maasto", name: "MML Maastokartta", needs: "mmlKey", create: (settings) => createMmlLayer("maastokartta", "png", settings.mmlKey, 16) },
  { id: "mml-tausta", name: "MML Taustakartta", needs: "mmlKey", create: (settings) => createMmlLayer("taustakartta", "png", settings.mmlKey, 16) },
  { id: "mml-selkokartta", name: "MML Selkokartta", needs: "mmlKey", create: (settings) => createMmlLayer("selkokartta", "png", settings.mmlKey, 16) },
  { id: "mml-ortokuva", name: "MML Ortokuva", needs: "mmlKey", create: (settings) => createMmlLayer("ortokuva", "jpg", settings.mmlKey, 16) },
  { id: "lantmateriet-topo", name: "Lantmäteriet Topo", needs: "lantmaterietUsername", note: "Lantmäteriet-sähköposti ja salasana vaaditaan", create: () => createLantmaterietLayer() },
];
