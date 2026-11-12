import { recordDebugEvent, setNetworkRequestActive } from "./debugMonitor";

export async function fetchWithDebug(input: RequestInfo | URL, init: RequestInit | undefined, service: string): Promise<Response> {
  setNetworkRequestActive(true);
  const started = performance.now();
  try {
    const response = await fetch(input, init);
    setNetworkRequestActive(false, !response.ok);
    if (!response.ok) recordDebugEvent("network", `${service}: HTTP ${response.status}`, "warning");
    return response;
  } catch (error) {
    setNetworkRequestActive(false, true);
    recordDebugEvent("network", `${service}: request failed`, "error");
    throw error;
  } finally {
    const duration = Math.round(performance.now() - started);
    if (duration > 5_000) recordDebugEvent("network", `${service}: slow request (${duration} ms)`, "warning");
  }
}
