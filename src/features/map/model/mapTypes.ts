export type Tool = "none" | "measure" | "marker";

export interface ProfilePoint {
  dist: number;
  elev: number | null;
}

export interface Measure {
  length: number;
  geojson: string;
  kind: "distance" | "area";
}

export interface SelectedFeature {
  id: number;
  kind: "marker" | "measurement";
  title: string;
  description?: string | null;
  color?: string;
  folder_id?: string | null;
  geojson?: string;
}

export interface LayerCopy {
  id: string;
  sourceId: string;
  name: string;
  role: "basemap" | "overlay";
  opacity: number;
}
