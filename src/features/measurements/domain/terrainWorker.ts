import {
  executeTerrainRouteCompute,
  type TerrainComputeInput,
  type TerrainComputeOutput,
} from "./terrainCompute";

export interface TerrainWorkerRequest {
  id: number;
  payload: TerrainComputeInput;
}

export interface TerrainWorkerResponse {
  id: number;
  result?: TerrainComputeOutput;
  error?: string;
}

self.onmessage = (event: MessageEvent<TerrainWorkerRequest>) => {
  const { id, payload } = event.data;
  try {
    const result = executeTerrainRouteCompute(payload);
    const response: TerrainWorkerResponse = { id, result };
    self.postMessage(response);
  } catch (err) {
    const response: TerrainWorkerResponse = {
      id,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
