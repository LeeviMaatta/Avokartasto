import { TERRAIN_NONE, type TerrainGrid } from "../terrainRouting";

export function createTestGrid(
  width: number,
  height: number,
  stepM = 20,
  elevFn: (x: number, y: number) => number = () => 10,
  flagFn: (x: number, y: number) => number = () => TERRAIN_NONE,
): TerrainGrid {
  const elevations = new Float32Array(width * height);
  const terrainFlags = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      elevations[idx] = elevFn(x, y);
      terrainFlags[idx] = flagFn(x, y);
    }
  }
  return {
    width,
    height,
    minX: 2770000,
    minY: 8430000,
    stepX: stepM * 2,
    stepY: stepM * 2,
    metersPerUnit: 0.5,
    elevations,
    terrainFlags,
  };
}
