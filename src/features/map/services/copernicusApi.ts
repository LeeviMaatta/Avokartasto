import { fetchWithDebug } from "../../debug/services/debugFetch";
import { todayIsoDate } from "./copernicusDates";

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
