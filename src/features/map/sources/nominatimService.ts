import { inTauri } from "../../../infrastructure/tauri/runtime";
import {
  nominatimReverseBackend,
  nominatimSearchBackend,
} from "../../../infrastructure/tauri/nominatimBridge";
import { fetchWithDebug } from "../../debug/debugFetch";
import { recordDebugEvent, setNetworkRequestActive } from "../../debug/debugMonitor";

export type NominatimSearchHit = {
  display_name: string;
  lat: string;
  lon: string;
};

export type NominatimReversePayload = {
  name?: string;
  display_name?: string;
  address?: {
    road?: string;
    pedestrian?: string;
    footway?: string;
    path?: string;
    house_number?: string;
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    village?: string;
    hamlet?: string;
    town?: string;
    city?: string;
    municipality?: string;
  };
};

function isAbortError(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
}

async function runWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

export async function searchNominatim(
  query: string,
  options: { limit?: number; signal?: AbortSignal; label?: string } = {},
): Promise<NominatimSearchHit[]> {
  const { limit = 5, signal, label = "place search" } = options;
  let data: unknown;

  if (inTauri()) {
    setNetworkRequestActive(true);
    let failed = false;
    try {
      const raw = await runWithAbort(nominatimSearchBackend(query, limit), signal);
      data = JSON.parse(raw) as unknown;
    } catch (err) {
      failed = true;
      if (!isAbortError(signal)) {
        recordDebugEvent("network", `${label} error`, "error");
      }
      throw err;
    } finally {
      setNetworkRequestActive(false, failed);
    }
  } else {
    const response = await fetchWithDebug(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&accept-language=fi&q=${encodeURIComponent(query)}`,
      { signal },
      label,
    );
    if (!response.ok) throw new Error("Paikkahaku epäonnistui.");
    data = await response.json();
  }

  if (!Array.isArray(data)) throw new Error("Paikkahaun vastaus oli virheellinen.");
  return data.filter(
    (item): item is NominatimSearchHit =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as NominatimSearchHit).display_name === "string" &&
      typeof (item as NominatimSearchHit).lat === "string" &&
      typeof (item as NominatimSearchHit).lon === "string",
  );
}

export async function reverseNominatim(
  lat: number,
  lon: number,
  options: { zoom?: number; signal?: AbortSignal } = {},
): Promise<NominatimReversePayload> {
  const { zoom = 18, signal } = options;

  if (inTauri()) {
    setNetworkRequestActive(true);
    let failed = false;
    try {
      const raw = await runWithAbort(nominatimReverseBackend(lat, lon, zoom), signal);
      return JSON.parse(raw) as NominatimReversePayload;
    } catch (err) {
      failed = true;
      if (!isAbortError(signal)) {
        recordDebugEvent("network", "reverse geocode error", "error");
      }
      throw err;
    } finally {
      setNetworkRequestActive(false, failed);
    }
  }

  const response = await fetchWithDebug(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=fi&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&zoom=${zoom}`,
    { signal },
    "reverse geocode",
  );
  if (!response.ok) {
    throw new Error(`Nominatim HTTP ${response.status}`);
  }
  return (await response.json()) as NominatimReversePayload;
}
