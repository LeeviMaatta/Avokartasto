import { exportGeoJsonFile, type ExportResult } from "../../../shared/exportFile";
import type { Measure } from "../../map/model/mapTypes";

export type { ExportResult };

export const exportMeasurement = async (measure: Measure, title?: string, description?: string): Promise<ExportResult> => {
  const geojsonContent = JSON.stringify(
    {
      type: "Feature",
      properties: {
        type: measure.kind,
        ...(title?.trim() ? { name: title.trim() } : {}),
        ...(description?.trim() ? { description: description.trim() } : {}),
      },
      geometry: JSON.parse(measure.geojson),
    },
    null,
    2,
  );
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeTitle = title?.trim().replace(/[<>:"/\\|?*]+/g, "_");
  const filename = `${safeTitle || "mittaus"}-${dateStr}.geojson`;

  return exportGeoJsonFile(filename, geojsonContent);
};
