import { toEtrs } from "../projections";

export function formatDms(val: number, posChar: string, negChar: string): string {
  const dir = val >= 0 ? posChar : negChar;
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60);
  return `${deg}° ${min.toString().padStart(2, "0")}′ ${sec.toString().padStart(2, "0")}″ ${dir}`;
}

export function formatWgsCoords(lat: number, lon: number, coordFormat: string): string {
  return coordFormat === "dms"
    ? `${formatDms(lat, "N", "S")}, ${formatDms(lon, "E", "W")}`
    : `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
}

export function formatEtrsCoords(lon: number, lat: number): string {
  const [easting, northing] = toEtrs([lon, lat]);
  return `N: ${Math.round(northing)}, E: ${Math.round(easting)}`;
}
