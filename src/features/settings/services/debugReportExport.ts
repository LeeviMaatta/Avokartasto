import { useDebugStore } from "../../debug/model/debugStore";
import type { DebugSettings } from "../../debug/model/debugTypes";

/** Downloads the current debug settings, snapshot, and event log as a JSON file. */
export function downloadDebugReport(debugSettings: DebugSettings): void {
  const report = {
    createdAt: new Date().toISOString(),
    settings: debugSettings,
    snapshot: useDebugStore.getState().snapshot,
    events: useDebugStore.getState().events,
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `avokartasto-debug-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
