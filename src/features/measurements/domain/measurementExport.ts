import { inTauri, invokeTauri } from "../../../infrastructure/tauri/runtime";
import type { Measure } from "../../map/model/mapTypes";

export type ExportResult =
  | { status: "saved"; path: string }
  | { status: "cancelled" };

export const exportMeasurement = async (measure: Measure, title?: string): Promise<ExportResult> => {
  const geojsonContent = JSON.stringify(
    {
      type: "Feature",
      properties: {
        type: measure.kind,
        ...(title?.trim() ? { name: title.trim() } : {}),
      },
      geometry: JSON.parse(measure.geojson),
    },
    null,
    2,
  );
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeTitle = title?.trim().replace(/[<>:"/\\|?*]+/g, "_");
  const filename = `${safeTitle || "mittaus"}-${dateStr}.geojson`;

  const picker = (window as unknown as {
    showSaveFilePicker?: (opts: unknown) => Promise<{
      name: string;
      createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }>;
    }>;
  }).showSaveFilePicker;

  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [
          {
            description: "GeoJSON-tiedosto",
            accept: { "application/geo+json": [".geojson", ".json"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(geojsonContent);
      await writable.close();
      return { status: "saved", path: handle.name };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { status: "cancelled" };
      }
      // Jos showSaveFilePicker ei ole sallittu WebView-kontekstissa, käytetään varatapaa
    }
  }

  if (inTauri()) {
    const savedPath = await invokeTauri<string>("save_export_file", {
      filename,
      content: geojsonContent,
    });
    return { status: "saved", path: savedPath };
  }

  const blob = new Blob([geojsonContent], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 5000);
  return { status: "saved", path: filename };
};
