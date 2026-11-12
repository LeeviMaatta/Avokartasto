import type { Measure } from "../../map/model/mapTypes";

export const exportMeasurement = (measure: Measure) => {
  const blob = new Blob([JSON.stringify({
    type: "Feature",
    properties: { type: measure.kind },
    geometry: JSON.parse(measure.geojson),
  }, null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mittaus-${new Date().toISOString().slice(0, 10)}.geojson`;
  link.click();
  URL.revokeObjectURL(url);
};
