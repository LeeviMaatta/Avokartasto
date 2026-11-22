import type { MapSource } from "../model/sourceTypes";
import {
  COPERNICUS_MIN_YEAR,
  COPERNICUS_SEASON_PRESETS,
  formatCopernicusTimeLabel,
  formatFiDate,
  resolveCopernicusRangeBounds,
  resolveCopernicusTimeRange,
  todayIsoDate,
  type CopernicusDateMode,
} from "./copernicusDates";
import {
  fetchCopernicusAvailableDates,
  fetchCopernicusAvailableDatesInRange,
  fetchCopernicusLayers,
  type CopernicusAvailableDay,
  type CopernicusLayerInfo,
} from "./copernicusApi";

export {
  COPERNICUS_MIN_YEAR,
  COPERNICUS_SEASON_PRESETS,
  fetchCopernicusAvailableDates,
  fetchCopernicusAvailableDatesInRange,
  fetchCopernicusLayers,
  formatCopernicusTimeLabel,
  formatFiDate,
  resolveCopernicusRangeBounds,
  resolveCopernicusTimeRange,
  todayIsoDate,
  type CopernicusAvailableDay,
  type CopernicusDateMode,
  type CopernicusLayerInfo,
};

export const COPERNICUS_LAYER_PRESETS: { id: string; label: string }[] = [
  { id: "TRUE-COLOR", label: "True Color" },
  { id: "1_TRUE_COLOR", label: "1_TRUE_COLOR" },
  { id: "FALSE-COLOR", label: "False Color" },
  { id: "NDVI", label: "NDVI" },
];

export function isCopernicusSource(source?: Pick<MapSource, "builtin_key" | "url"> | null): boolean {
  if (!source) return false;
  return Boolean(
    source.builtin_key === "copernicus-s2" ||
    (source.url && source.url.includes("sh.dataspace.copernicus.eu")),
  );
}

/** Tarkistaa onko jokin Copernicus-taso aktiivisena ja näkyvissä roolinsa mukaisesti. */
export function isCopernicusActiveForSelection(
  sources: Pick<MapSource, "id" | "role" | "builtin_key" | "url">[],
  basemap: string,
  overlays: string[],
  hiddenLayers: string[] = [],
): boolean {
  const hiddenSet = new Set(hiddenLayers.filter(Boolean));
  const matchesId = (src: Pick<MapSource, "id" | "builtin_key">, id: string) =>
    Boolean(id) && (id === `src:${src.id}` || (Boolean(src.builtin_key) && id === src.builtin_key));

  return sources.some((src) => {
    if (!isCopernicusSource(src)) return false;
    if (hiddenSet.has(`src:${src.id}`) || (src.builtin_key && hiddenSet.has(src.builtin_key))) {
      return false;
    }
    return src.role === "basemap"
      ? matchesId(src, basemap)
      : overlays.some((id) => matchesId(src, id));
  });
}

export function buildCopernicusWmsParams(settings: Record<string, string>): Record<string, unknown> {
  const rawCloud = Number(settings.copernicusMaxCloud ?? "20");
  const maxcc = Number.isFinite(rawCloud) ? Math.max(0, Math.min(100, Math.round(rawCloud))) : 20;
  const layers = (settings.copernicusLayerName || "TRUE-COLOR").trim() || "TRUE-COLOR";

  return {
    LAYERS: layers,
    MAXCC: maxcc,
    TIME: resolveCopernicusTimeRange(settings),
    PRIORITY: "leastCC",
  };
}
