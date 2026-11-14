import { toLonLat } from "ol/proj";
import { runWithAbort } from "../../../../shared/async/abort";
import { inTauri } from "../../../../infrastructure/tauri/runtime";
import { terrainOverpassQueryBackend } from "../../../../infrastructure/tauri/terrainBridge";
import { fetchWithDebug } from "../../../debug/services/debugFetch";
import { recordDebugEvent, setNetworkRequestActive } from "../../../debug/services/debugMonitor";
import type { OverpassElement } from "./osmObstacleClassifier";
import type { TerrainGridSpec } from "./demTileFetcher";

const OVERPASS_CACHE_LIMIT = 24;
const OVERPASS_CLIENT_TIMEOUT_MS = 10_000;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

interface CachedOverpassEntry {
  west: number;
  south: number;
  east: number;
  north: number;
  hasSwamp: boolean;
  hasWater: boolean;
  hasStreams: boolean;
  elements: OverpassElement[];
}

const overpassCache: CachedOverpassEntry[] = [];

function findCachedOverpassObstacles(
  west: number,
  south: number,
  east: number,
  north: number,
  needSwamp: boolean,
  needWater: boolean,
  needStreams: boolean,
): OverpassElement[] | null {
  for (let i = overpassCache.length - 1; i >= 0; i--) {
    const entry = overpassCache[i];
    if (
      entry.west <= west &&
      entry.south <= south &&
      entry.east >= east &&
      entry.north >= north &&
      (!needSwamp || entry.hasSwamp) &&
      (!needWater || entry.hasWater) &&
      (!needStreams || entry.hasStreams)
    ) {
      return entry.elements;
    }
  }
  return null;
}

function storeCachedOverpassObstacles(entry: CachedOverpassEntry): void {
  if (overpassCache.length >= OVERPASS_CACHE_LIMIT) {
    overpassCache.shift();
  }
  overpassCache.push(entry);
}

function buildOverpassQuery(
  bbox: string,
  needSwamp: boolean,
  needWater: boolean,
  needStreams: boolean,
): string {
  const parts: string[] = [];
  if (needSwamp) {
    parts.push(
      `way["natural"="wetland"](${bbox});`,
      `relation["natural"="wetland"](${bbox});`,
    );
  }
  if (needWater) {
    parts.push(
      `way["natural"="water"](${bbox});`,
      `relation["natural"="water"](${bbox});`,
      `way["waterway"~"^(river|canal|riverbank)$"](${bbox});`,
      `relation["waterway"="riverbank"](${bbox});`,
    );
    if (needStreams) {
      parts.push(`way["waterway"="stream"](${bbox});`);
    }
  }
  return `[out:json][timeout:10][maxsize:33554432];(${parts.join("")});out geom;`;
}

function raceFirstSuccess<T>(promises: Promise<T>[]): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let remaining = promises.length;
    if (remaining === 0) {
      reject(new Error("Ei hakupyyntöjä"));
      return;
    }
    let lastError: unknown;
    for (const promise of promises) {
      promise.then(resolve, (err) => {
        lastError = err;
        remaining -= 1;
        if (remaining === 0) {
          reject(lastError instanceof Error ? lastError : new Error(String(lastError)));
        }
      });
    }
  });
}

export async function fetchOverpassObstacles(
  spec: TerrainGridSpec,
  needSwamp: boolean,
  needWater: boolean,
  needStreams: boolean,
  signal?: AbortSignal,
): Promise<OverpassElement[]> {
  if (!needSwamp && !needWater) return [];

  const [west, south] = toLonLat([spec.minX, spec.minY]);
  const [east, north] = toLonLat([spec.maxX, spec.maxY]);
  const cached = findCachedOverpassObstacles(west, south, east, north, needSwamp, needWater, needStreams);
  if (cached) return cached;

  // Laajennetaan hakualuetta hieman (~0.004°), jotta pienten pisteiden siirrot osuvat välimuistiin
  const qWest = west - 0.004;
  const qSouth = south - 0.004;
  const qEast = east + 0.004;
  const qNorth = north + 0.004;
  const bbox = `${qSouth.toFixed(5)},${qWest.toFixed(5)},${qNorth.toFixed(5)},${qEast.toFixed(5)}`;
  const query = buildOverpassQuery(bbox, needSwamp, needWater, needStreams);

  if (inTauri()) {
    setNetworkRequestActive(true);
    try {
      const raw = await runWithAbort(terrainOverpassQueryBackend(query), signal, "Maastoreititys peruutettu");
      setNetworkRequestActive(false, false);
      const data = JSON.parse(raw) as { elements?: OverpassElement[] };
      const elements = Array.isArray(data.elements) ? data.elements : [];
      storeCachedOverpassObstacles({
        west: qWest, south: qSouth, east: qEast, north: qNorth,
        hasSwamp: needSwamp, hasWater: needWater, hasStreams: needWater && needStreams,
        elements,
      });
      return elements;
    } catch (err) {
      setNetworkRequestActive(false, true);
      if (!signal?.aborted) {
        recordDebugEvent("network", "terrain-obstacles: overpass failed", "warning");
      }
      throw err instanceof Error ? err : new Error("Maastoesteiden haku epäonnistui");
    }
  }

  const raceController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => raceController.abort(), OVERPASS_CLIENT_TIMEOUT_MS);
  const onParentAbort = () => raceController.abort();
  signal?.addEventListener("abort", onParentAbort, { once: true });

  try {
    const body = `data=${encodeURIComponent(query)}`;
    const attempts = OVERPASS_ENDPOINTS.map(async (endpoint) => {
      const res = await fetchWithDebug(
        endpoint,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
          body,
          signal: raceController.signal,
        },
        "terrain-obstacles",
      );
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const data = (await res.json()) as { elements?: OverpassElement[] };
      return Array.isArray(data.elements) ? data.elements : [];
    });

    const elements = await raceFirstSuccess(attempts);
    raceController.abort();
    storeCachedOverpassObstacles({
      west: qWest, south: qSouth, east: qEast, north: qNorth,
      hasSwamp: needSwamp, hasWater: needWater, hasStreams: needWater && needStreams,
      elements,
    });
    return elements;
  } catch (err) {
    if (signal?.aborted) {
      throw new DOMException("Maastoreititys peruutettu", "AbortError");
    }
    throw err instanceof Error ? err : new Error("Maastoesteiden haku epäonnistui");
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onParentAbort);
  }
}
