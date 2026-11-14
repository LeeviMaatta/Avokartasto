import type { MapSource } from "../model/sourceTypes";
import { fetchWithDebug } from "../../debug/services/debugFetch";

export type CopernicusDateMode = "latest" | "single" | "range";

export const COPERNICUS_MIN_YEAR = 2016;

export const COPERNICUS_SEASON_PRESETS: { id: string; label: string; start: string; end: string }[] = [
  { id: "spring", label: "Kevät", start: "03-01", end: "05-31" },
  { id: "summer", label: "Kesä", start: "06-01", end: "08-31" },
  { id: "autumn", label: "Syksy", start: "09-01", end: "11-30" },
  { id: "winter", label: "Talvi", start: "12-01", end: "02-28" },
  { id: "year", label: "Koko vuosi", start: "01-01", end: "12-31" },
];

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

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(isoDate: string, deltaDays: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return todayIsoDate();
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function clampLeapDay(year: number, mmdd: string): string {
  if (mmdd !== "02-29") return mmdd;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? "02-29" : "02-28";
}

function normalizeMmDd(value: string | undefined, fallback: string): string {
  return /^\d{2}-\d{2}$/.test(value ?? "") ? value! : fallback;
}

export type CopernicusLayerInfo = { name: string; title: string };
export type CopernicusAvailableDay = { date: string; cloudCover: number };

const capabilitiesCache = new Map<string, CopernicusLayerInfo[]>();
const availableDatesCache = new Map<string, CopernicusAvailableDay[]>();

/** Yhteinen WFS-hakufunktio halutulle päivämäärävälille ja pilvisyysrajalle. */
async function fetchCopernicusAvailableDatesSpan(
  instanceId: string,
  lon: number,
  lat: number,
  maxCloud: number,
  startIso: string,
  endIso: string,
  cacheTag: string,
): Promise<CopernicusAvailableDay[]> {
  const id = instanceId.trim();
  if (!id) return [];
  const today = todayIsoDate();
  const effectiveEnd = endIso > today ? today : endIso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveEnd) || startIso > effectiveEnd) {
    return [];
  }

  const qLon = lon.toFixed(1);
  const qLat = lat.toFixed(1);
  const clampedCloud = Math.max(0, Math.min(100, Math.round(maxCloud)));
  const cacheKey = `${id}:${qLon},${qLat}:${clampedCloud}:${cacheTag}`;
  const cached = availableDatesCache.get(cacheKey);
  if (cached) return cached;

  const box = `${(lon - 0.05).toFixed(4)},${(lat - 0.05).toFixed(4)},${(lon + 0.05).toFixed(4)},${(lat + 0.05).toFixed(4)}`;
  const url =
    `https://sh.dataspace.copernicus.eu/ogc/wfs/${encodeURIComponent(id)}` +
    `?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=DSS2` +
    `&OUTPUTFORMAT=application/json&SRSNAME=CRS:84` +
    `&BBOX=${encodeURIComponent(box)}` +
    `&TIME=${startIso}/${effectiveEnd}` +
    `&MAXCC=${clampedCloud}&MAXFEATURES=100`;

  const res = await fetchWithDebug(url, undefined, "copernicus wfs");
  if (!res.ok) throw new Error(`Copernicus-luettelohaku: ${res.status}`);
  const data = (await res.json()) as {
    features?: Array<{ properties?: { date?: string; cloudCoverPercentage?: number } }>;
  };

  const byDate = new Map<string, number>();
  for (const feat of data.features ?? []) {
    const dateKey = feat.properties?.date;
    if (!dateKey || dateKey.length < 10) continue;
    const cc = typeof feat.properties?.cloudCoverPercentage === "number"
      ? feat.properties.cloudCoverPercentage
      : clampedCloud;
    const prev = byDate.get(dateKey);
    if (prev === undefined || cc < prev) byDate.set(dateKey, cc);
  }

  const result = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cloudCover]) => ({ date, cloudCover }));
  availableDatesCache.set(cacheKey, result);
  return result;
}

/** Hakee Sentinel-2 L2A -kuvauspäivät, jotka läpäisevät pilvisyyssuodattimen valitun kuukauden ympäriltä. */
export async function fetchCopernicusAvailableDates(
  instanceId: string,
  lon: number,
  lat: number,
  maxCloud: number,
  year: number,
  month: number,
): Promise<CopernicusAvailableDay[]> {
  const startD = new Date(Date.UTC(year, month - 3, 1));
  const endD = new Date(Date.UTC(year, month + 1, 0));
  return fetchCopernicusAvailableDatesSpan(
    instanceId,
    lon,
    lat,
    maxCloud,
    startD.toISOString().slice(0, 10),
    endD.toISOString().slice(0, 10),
    `${year}-${String(month).padStart(2, "0")}`,
  );
}

/** Hakee pilvisyysrajan täyttävät Sentinel-2 L2A -kuvauspäivät haarukan aikaväliltä. */
export async function fetchCopernicusAvailableDatesInRange(
  instanceId: string,
  lon: number,
  lat: number,
  maxCloud: number,
  startIso: string,
  endIso: string,
): Promise<CopernicusAvailableDay[]> {
  return fetchCopernicusAvailableDatesSpan(
    instanceId,
    lon,
    lat,
    maxCloud,
    startIso,
    endIso,
    `range:${startIso}..${endIso}`,
  );
}

export function formatFiDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

/** Palauttaa haarukan alku- ja loppupäivän ISO-muodossa huomioiden vuodenvaihteen ja karkauspäivän. */
export function resolveCopernicusRangeBounds(settings: Record<string, string>): { startIso: string; endIso: string } {
  const currentYear = new Date().getFullYear();
  const parsedYear = Number(settings.copernicusRangeYear);
  const year = Number.isInteger(parsedYear)
    ? Math.max(COPERNICUS_MIN_YEAR, Math.min(currentYear, parsedYear))
    : currentYear;
  const startMmDd = normalizeMmDd(settings.copernicusRangeStart, "06-01");
  const endMmDd = normalizeMmDd(settings.copernicusRangeEnd, "08-31");
  const endYear = startMmDd > endMmDd ? year + 1 : year;
  return {
    startIso: `${year}-${clampLeapDay(year, startMmDd)}`,
    endIso: `${endYear}-${clampLeapDay(endYear, endMmDd)}`,
  };
}

function getSelectedRangeDate(settings: Record<string, string>, startIso: string, endIso: string): string | null {
  const candidate = settings.copernicusRangeSelectedDate ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  return candidate >= startIso && candidate <= endIso ? candidate : null;
}

/** Muotoilee aktiivisen Copernicus-aikavälin luettavaan suomalaiseen muotoon. */
export function formatCopernicusTimeLabel(settings: Record<string, string>): string {
  const mode = (settings.copernicusDateMode as CopernicusDateMode) || "latest";
  if (mode === "single") {
    const single = /^\d{4}-\d{2}-\d{2}$/.test(settings.copernicusSingleDate ?? "")
      ? settings.copernicusSingleDate
      : todayIsoDate();
    return formatFiDate(single);
  }
  if (mode === "latest") return "Uusin (60 pv)";
  const { startIso, endIso } = resolveCopernicusRangeBounds(settings);
  const selectedInRange = getSelectedRangeDate(settings, startIso, endIso);
  if (selectedInRange) return formatFiDate(selectedInRange);
  return `${formatFiDate(startIso)} – ${formatFiDate(endIso)}`;
}

/** Hakee käyttäjän Copernicus-instanssin saatavilla olevat WMS-kerrokset GetCapabilities-kutsulla. */
export async function fetchCopernicusLayers(instanceId: string): Promise<CopernicusLayerInfo[]> {
  const id = instanceId.trim();
  if (!id) return [];
  const cached = capabilitiesCache.get(id);
  if (cached) return cached;

  const url = `https://sh.dataspace.copernicus.eu/ogc/wms/${encodeURIComponent(id)}?SERVICE=WMS&REQUEST=GetCapabilities`;
  const res = await fetchWithDebug(url, undefined, "copernicus wms");
  if (!res.ok) throw new Error(`Copernicus GetCapabilities: ${res.status}`);
  const xmlText = await res.text();
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  const layerNodes = Array.from(doc.querySelectorAll("Capability > Layer > Layer"));
  const layers: CopernicusLayerInfo[] = [];
  for (const node of layerNodes) {
    const name = node.querySelector(":scope > Name")?.textContent?.trim();
    if (!name) continue;
    const title = node.querySelector(":scope > Title")?.textContent?.trim() || name;
    layers.push({ name, title });
  }
  capabilitiesCache.set(id, layers);
  return layers;
}

export function resolveCopernicusTimeRange(settings: Record<string, string>): string {
  const mode = (settings.copernicusDateMode as CopernicusDateMode) || "latest";
  if (mode === "single") {
    const single = /^\d{4}-\d{2}-\d{2}$/.test(settings.copernicusSingleDate ?? "")
      ? settings.copernicusSingleDate
      : todayIsoDate();
    return `${single}T00:00:00Z/${single}T23:59:59Z`;
  }
  if (mode === "range") {
    const { startIso, endIso } = resolveCopernicusRangeBounds(settings);
    const selectedInRange = getSelectedRangeDate(settings, startIso, endIso);
    if (selectedInRange) {
      return `${selectedInRange}T00:00:00Z/${selectedInRange}T23:59:59Z`;
    }
    return `${startIso}/${endIso}`;
  }
  const end = todayIsoDate();
  const start = addDaysIso(end, -60);
  return `${start}/${end}`;
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
