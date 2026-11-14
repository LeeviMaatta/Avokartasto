export const TERRAIN_NONE = 0;
export const TERRAIN_SWAMP = 1 << 0;
export const TERRAIN_WATER = 1 << 1;
export const TERRAIN_SWAMP_WET = 1 << 2;

export type TerrainRoutePreset = "min-climb" | "balanced";

export interface TerrainGrid {
  width: number;
  height: number;
  /** Ruudukon länsireuna EPSG:3857-koordinaatistossa */
  minX: number;
  /** Ruudukon eteläreuna EPSG:3857-koordinaatistossa */
  minY: number;
  /** Yhden solun leveys EPSG:3857-yksiköissä */
  stepX: number;
  /** Yhden solun korkeus EPSG:3857-yksiköissä */
  stepY: number;
  /** Yhden EPSG:3857-yksikön todellinen maastopituus metreinä (cos(lat)) */
  metersPerUnit: number;
  /** Korkeudet metreinä (pituus width * height, rivi-järjestyessä y=0..height-1) */
  elevations: Float32Array;
  /** Maastoluokat bittimaskina (TERRAIN_SWAMP | TERRAIN_WATER) */
  terrainFlags: Uint8Array;
}

export interface TerrainRouteOptions {
  preset?: TerrainRoutePreset;
  avoidSwamp?: boolean;
  avoidWater?: boolean;
  /** Huomioidaanko kapeat purot ja ojat (waterway=stream) vesistökierrossa */
  avoidStreams?: boolean;
  /** Nousumetrin painoarvo suhteessa vaakametriin (oletus johdetaan presetistä) */
  climbWeight?: number;
  /** Jyrkkyysneliön lisäsakko (rankaisee jyrkkiä nousuja loivaa enemmän) */
  slopePenalty?: number;
  /** Suoalueen kulkukustannuskerroin (oletus 40x) */
  swampMultiplier?: number;
}

export interface TerrainRouteStats {
  originalLengthM: number;
  routedLengthM: number;
  originalClimbM: number;
  routedClimbM: number;
}

export interface GridPoint {
  x: number;
  y: number;
}
