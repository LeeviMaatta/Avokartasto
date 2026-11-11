import proj4 from "proj4";
import { register } from "ol/proj/proj4";

proj4.defs(
  "EPSG:3067",
  "+proj=utm +zone=35 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs"
);
register(proj4);

/** [lon, lat] -> [E, N] ETRS-TM35FIN */
export const toEtrs = (lonLat: [number, number]) =>
  proj4("EPSG:4326", "EPSG:3067", lonLat) as [number, number];
