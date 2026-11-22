import {
  executeTerrainRouteCompute,
  type TerrainComputeInput,
  type TerrainComputeOutput,
} from "../terrainCompute";
import type { TerrainWorkerRequest, TerrainWorkerResponse } from "../terrainWorker";

let workerInstance: Worker | null = null;
let workerReqSeq = 0;

export async function runTerrainComputeOffMainThread(
  input: TerrainComputeInput,
  signal?: AbortSignal,
): Promise<TerrainComputeOutput> {
  if (typeof Worker === "undefined") {
    return executeTerrainRouteCompute(input);
  }

  let worker: Worker;
  try {
    if (!workerInstance) {
      workerInstance = new Worker(new URL("../terrainWorker.ts", import.meta.url), {
        type: "module",
      });
    }
    worker = workerInstance;
  } catch {
    return executeTerrainRouteCompute(input);
  }

  return await new Promise<TerrainComputeOutput>((resolve, reject) => {
    const reqId = ++workerReqSeq;
    // Kopioidaan siirrettäväksi puskuriksi Workerille, jolloin pääsäikeen viite pysyy puhtaana
    const elevCopy = new Float32Array(input.elevations);
    const payload: TerrainComputeInput = { ...input, elevations: elevCopy };

    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      worker.terminate();
      if (workerInstance === worker) workerInstance = null;
      reject(new DOMException("Maastoreititys peruutettu", "AbortError"));
    };

    const onMessage = (event: MessageEvent<TerrainWorkerResponse>) => {
      if (event.data.id !== reqId) return;
      cleanup();
      if (event.data.error) {
        reject(new Error(event.data.error));
      } else if (event.data.result) {
        resolve(event.data.result);
      } else {
        reject(new Error("Tyhjä vastaus reitityslaskennasta"));
      }
    };

    const onError = () => {
      cleanup();
      worker.terminate();
      if (workerInstance === worker) workerInstance = null;
      try {
        resolve(executeTerrainRouteCompute(input));
      } catch (err) {
        reject(err);
      }
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });

    const request: TerrainWorkerRequest = { id: reqId, payload };
    worker.postMessage(request, [elevCopy.buffer]);
  });
}
