import Feature from "ol/Feature";
import MVT from "ol/format/MVT";
import { TERRAIN_WATER } from "./terrainTypes";
import {
  classifyWetlandFlags,
  type VectorObstaclePolygon,
  type VectorObstaclePolyline,
} from "./osmObstacleClassifier";
import {
  fetchBinaryWithBackendOrFetch,
  MAX_TILES_PER_REQUEST,
  mercatorToTileCoords,
  setBoundedCache,
  tileExtent3857,
  type TerrainGridSpec,
} from "./demTileFetcher";

const VECTOR_TILE_CACHE_LIMIT = 96;
const VECTOR_TILE_TIMEOUT_MS = 6_000;
const OPENFREEMAP_TILEJSON_URL = "https://tiles.openfreemap.org/planet";
const OPENFREEMAP_TILEJSON_TTL_MS = 30 * 60_000;

const WETLAND_SUBCLASSES = new Set([
  "wetland", "bog", "marsh", "swamp", "fen", "reedbed", "wet_meadow",
  "tidalflat", "mangrove", "string_bog", "palsa_bog", "saltmarsh", "mud", "quagmire",
]);

export interface DecodedVectorTile {
  polygons: VectorObstaclePolygon[];
  polylines: VectorObstaclePolyline[];
}

interface VectorTileTemplateCache {
  template: string;
  maxZoom: number;
  expiresAt: number;
}

const vectorTileCache = new Map<string, DecodedVectorTile>();
let vectorTemplateCache: VectorTileTemplateCache | null = null;
const mvtParser = new MVT({ featureClass: Feature });

async function resolveOpenFreeMapTemplate(signal?: AbortSignal): Promise<{ template: string; maxZoom: number }> {
  if (vectorTemplateCache && vectorTemplateCache.expiresAt > Date.now()) {
    return { template: vectorTemplateCache.template, maxZoom: vectorTemplateCache.maxZoom };
  }
  const buf = await fetchBinaryWithBackendOrFetch(OPENFREEMAP_TILEJSON_URL, "terrain-vector-meta", signal);
  const text = new TextDecoder().decode(buf);
  const tj = JSON.parse(text) as { tiles?: string[]; maxzoom?: number };
  const template = Array.isArray(tj.tiles) && typeof tj.tiles[0] === "string" ? tj.tiles[0] : "";
  if (!template) {
    throw new Error("Vektoritiilien osoitepohja puuttuu");
  }
  const maxZoom = typeof tj.maxzoom === "number" ? tj.maxzoom : 14;
  vectorTemplateCache = { template, maxZoom, expiresAt: Date.now() + OPENFREEMAP_TILEJSON_TTL_MS };
  return { template, maxZoom };
}

export function decodeMvtVectorTile(
  buf: ArrayBuffer,
  z: number,
  x: number,
  y: number,
): DecodedVectorTile {
  const polygons: VectorObstaclePolygon[] = [];
  const polylines: VectorObstaclePolyline[] = [];
  if (buf.byteLength === 0) return { polygons, polylines };

  const features = mvtParser.readFeatures(buf, {
    extent: tileExtent3857(z, x, y),
    featureProjection: "EPSG:3857",
  });

  for (let i = 0; i < features.length; i++) {
    const feat = features[i];
    const props = feat.getProperties() as Record<string, unknown>;
    const layer = typeof props.layer === "string" ? props.layer : "";
    const cls = typeof props.class === "string" ? props.class : "";
    const sub = typeof props.subclass === "string" ? props.subclass : "";

    let flag = 0;
    let isStream = false;
    if (layer === "landcover") {
      if (cls === "wetland" || WETLAND_SUBCLASSES.has(sub)) {
        flag = classifyWetlandFlags(sub);
      }
    } else if (layer === "water") {
      if (cls !== "swimming_pool") flag = TERRAIN_WATER;
    } else if (layer === "waterway") {
      if (cls === "river" || cls === "canal") {
        flag = TERRAIN_WATER;
      } else if (cls === "stream" || cls === "drain" || cls === "ditch") {
        flag = TERRAIN_WATER;
        isStream = true;
      }
    }
    if (flag === 0) continue;

    const geom = feat.getGeometry();
    if (!geom) continue;
    const geomType = geom.getType();
    if (geomType === "Polygon") {
      const rings = (geom as unknown as { getCoordinates(): [number, number][][] }).getCoordinates();
      if (rings.length > 0) polygons.push({ flag, rings });
    } else if (geomType === "MultiPolygon") {
      const polys = (geom as unknown as { getCoordinates(): [number, number][][][] }).getCoordinates();
      for (const rings of polys) {
        if (rings.length > 0) polygons.push({ flag, rings });
      }
    } else if (geomType === "LineString") {
      const coords = (geom as unknown as { getCoordinates(): [number, number][] }).getCoordinates();
      if (coords.length >= 2) polylines.push({ flag, isStream, coords });
    } else if (geomType === "MultiLineString") {
      const lines = (geom as unknown as { getCoordinates(): [number, number][][] }).getCoordinates();
      for (const coords of lines) {
        if (coords.length >= 2) polylines.push({ flag, isStream, coords });
      }
    }
  }
  return { polygons, polylines };
}

export async function fetchVectorTileObstacles(
  spec: TerrainGridSpec,
  signal?: AbortSignal,
): Promise<DecodedVectorTile> {
  const controller = new AbortController();
  const timerId = globalThis.setTimeout(() => controller.abort(), VECTOR_TILE_TIMEOUT_MS);
  const onParentAbort = () => controller.abort();
  signal?.addEventListener("abort", onParentAbort, { once: true });

  try {
    const { template, maxZoom } = await resolveOpenFreeMapTemplate(controller.signal);
    const maxZ = Math.min(14, maxZoom);
    let chosenZ = Math.min(12, maxZ);
    for (let z = maxZ; z >= 12; z--) {
      const tl = mercatorToTileCoords(spec.minX, spec.maxY, z);
      const br = mercatorToTileCoords(spec.maxX, spec.minY, z);
      const count = (br.tileX - tl.tileX + 1) * (br.tileY - tl.tileY + 1);
      if (count <= MAX_TILES_PER_REQUEST) {
        chosenZ = z;
        break;
      }
    }

    const tl = mercatorToTileCoords(spec.minX, spec.maxY, chosenZ);
    const br = mercatorToTileCoords(spec.maxX, spec.minY, chosenZ);

    const tileJobs: Promise<DecodedVectorTile>[] = [];
    for (let tx = tl.tileX; tx <= br.tileX; tx++) {
      for (let ty = tl.tileY; ty <= br.tileY; ty++) {
        const key = `${chosenZ}/${tx}/${ty}`;
        const cached = vectorTileCache.get(key);
        if (cached) {
          tileJobs.push(Promise.resolve(cached));
        } else {
          const url = template
            .replace("{z}", String(chosenZ))
            .replace("{x}", String(tx))
            .replace("{y}", String(ty));
          tileJobs.push(
            fetchBinaryWithBackendOrFetch(url, "terrain-vector-tile", controller.signal).then((buf) => {
              const decoded = decodeMvtVectorTile(buf, chosenZ, tx, ty);
              setBoundedCache(vectorTileCache, key, decoded, VECTOR_TILE_CACHE_LIMIT);
              return decoded;
            }),
          );
        }
      }
    }

    const decodedTiles = await Promise.all(tileJobs);
    const polygons: VectorObstaclePolygon[] = [];
    const polylines: VectorObstaclePolyline[] = [];
    for (const tile of decodedTiles) {
      polygons.push(...tile.polygons);
      polylines.push(...tile.polylines);
    }
    return { polygons, polylines };
  } finally {
    globalThis.clearTimeout(timerId);
    signal?.removeEventListener("abort", onParentAbort);
  }
}
