import { inTauri, invokeTauri } from "../infrastructure/tauri/runtime";

export type ExportResult =
  | { status: "saved"; path: string }
  | { status: "cancelled" };

export async function exportGeoJsonFile(filename: string, content: string): Promise<ExportResult> {
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
      await writable.write(content);
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
      content,
    });
    return { status: "saved", path: savedPath };
  }

  const blob = new Blob([content], { type: "application/geo+json" });
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
}
