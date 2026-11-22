import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import type { TerrainRouteOptions, TerrainRouteStats } from "./terrainRouting";
import {
  classifyWetlandFlags,
  rasterizeOverpassElementsToGrid,
  rasterizeVectorObstaclesToGrid,
  type OverpassElement,
  type TerrainProfilePoint,
} from "./terrainCompute";
import {
  computeTerrainGridSpec,
  decodeTerrariumRgb,
  populateElevationGrid,
} from "./terrain/demTileFetcher";
import {
  fetchVectorTileObstacles,
  type DecodedVectorTile,
} from "./terrain/vectorObstacleLoader";
import { fetchOverpassObstacles } from "./terrain/overpassObstacleLoader";
import { runTerrainComputeOffMainThread } from "./terrain/terrainWorkerClient";

export {
  classifyWetlandFlags,
  computeTerrainGridSpec,
  decodeTerrariumRgb,
  rasterizeOverpassElementsToGrid,
  rasterizeVectorObstaclesToGrid,
  type OverpassElement,
};

export interface TerrainOptimizationOutput {
  coordinates: [number, number][];
  geojson: string;
  stats: TerrainRouteStats;
  profile: TerrainProfilePoint[];
  warnings: string[];
}

export interface OptimizeTerrainRouteCallbacks {
  onStage?: (stageLabel: string) => void;
}

/**
 * Hakee mittausalueen korkeusmallin ja suo-/vesistöesteet sekä optimoi
 * etäisyysmittauksen maastoreitiksi.
 */
export async function optimizeDistanceMeasurementToTerrainRoute(
  geojsonString: string,
  options: TerrainRouteOptions = {},
  signal?: AbortSignal,
  callbacks?: OptimizeTerrainRouteCallbacks,
): Promise<TerrainOptimizationOutput> {
  const geom = new GeoJSON().readGeometry(JSON.parse(geojsonString), {
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });
  if (!(geom instanceof LineString)) {
    throw new Error("Maastoreititys toimii vain etäisyysmittauksille (viiva).");
  }
  const waypointsMercator = geom.getCoordinates() as [number, number][];
  if (waypointsMercator.length < 2) {
    throw new Error("Mittauksessa on oltava vähintään kaksi pistettä.");
  }

  const spec = computeTerrainGridSpec(waypointsMercator);
  const avoidSwamp = options.avoidSwamp ?? true;
  const avoidWater = options.avoidWater ?? true;
  const avoidStreams = options.avoidStreams ?? false;
  const warnings: string[] = [];

  callbacks?.onStage?.("Haetaan maasto- ja korkeustietoja...");

  const elevationsPromise = populateElevationGrid(spec, signal);
  const obstaclesPromise: Promise<{
    overpass: OverpassElement[];
    vector: DecodedVectorTile;
  }> =
    avoidSwamp || avoidWater
      ? fetchVectorTileObstacles(spec, signal)
          .then((vector) => ({ overpass: [] as OverpassElement[], vector }))
          .catch(async (vectorErr) => {
            if (signal?.aborted) throw vectorErr;
            // Jos CDN-vektoritiilet epäonnistuvat, kokeillaan Overpass-varalähdettä Tauri-taustapalvelun kautta
            try {
              const overpass = await fetchOverpassObstacles(
                spec, avoidSwamp, avoidWater, avoidStreams, signal,
              );
              return { overpass, vector: { polygons: [], polylines: [] } };
            } catch (overpassErr) {
              if (signal?.aborted) throw overpassErr;
              warnings.push("Suo- tai vesistötietoja ei voitu hakea (reititettiin korkeusmallilla).");
              return { overpass: [], vector: { polygons: [], polylines: [] } };
            }
          })
      : Promise.resolve({ overpass: [], vector: { polygons: [], polylines: [] } });

  const [elevations, loadedObstacles] = await Promise.all([elevationsPromise, obstaclesPromise]);
  if (signal?.aborted) {
    throw new DOMException("Maastoreititys peruutettu", "AbortError");
  }

  callbacks?.onStage?.("Lasketaan reittiä...");

  const computeResult = await runTerrainComputeOffMainThread(
    {
      width: spec.width,
      height: spec.height,
      minX: spec.minX,
      minY: spec.minY,
      stepX: spec.stepX,
      stepY: spec.stepY,
      metersPerUnit: spec.metersPerUnit,
      elevations,
      waypointsMercator,
      obstacles: loadedObstacles.overpass,
      vectorPolygons: loadedObstacles.vector.polygons,
      vectorPolylines: loadedObstacles.vector.polylines,
      options,
    },
    signal,
  );

  return { ...computeResult, warnings };
}
