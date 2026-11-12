import { useEffect, type MutableRefObject } from "react";
import GeoJSON from "ol/format/GeoJSON";
import VectorSource from "ol/source/Vector";
import { listFeatures } from "../../../infrastructure/tauriBridge";

interface MapFeaturesOptions {
  featureSource: MutableRefObject<VectorSource>;
  featuresVersion: number;
  markerFolders: string;
  hiddenFeatures: string;
}

export function useMapFeatures({ featureSource, featuresVersion, markerFolders, hiddenFeatures }: MapFeaturesOptions) {
  useEffect(() => {
    void listFeatures().then((rows) => {
      featureSource.current.clear();
      const format = new GeoJSON();
      let visibleFolders = new Set<string>();
      let hiddenFeatureIds = new Set<number>();
      try {
        const folders = JSON.parse(markerFolders) as Array<{ id?: string; visible?: boolean }>;
        visibleFolders = new Set(folders.filter((folder) => folder.visible !== false && typeof folder.id === "string").map((folder) => folder.id!));
      } catch {
        visibleFolders = new Set();
      }
      try {
        const ids = JSON.parse(hiddenFeatures);
        if (Array.isArray(ids)) hiddenFeatureIds = new Set(ids.filter((id): id is number => Number.isInteger(id)));
      } catch {
        hiddenFeatureIds = new Set();
      }
      rows.forEach((row) => {
        if (hiddenFeatureIds.has(row.id)) return;
        if (row.folder_id && visibleFolders.size > 0 && !visibleFolders.has(row.folder_id)) return;
        if (row.folder_id && visibleFolders.size === 0) return;
        try {
          featureSource.current.addFeatures(format.readFeatures({
            type: "Feature",
            geometry: JSON.parse(row.geojson),
            properties: { id: row.id, title: row.title, description: row.description, color: row.color, folder_id: row.folder_id },
          }, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }));
        } catch (error) {
          console.error(`Tallennetun merkinnän ${row.id} geometria ei kelpaa`, error);
        }
      });
    }).catch((error) => console.error("Tallennettujen kohteiden lataus epäonnistui", error));
  }, [featureSource, featuresVersion, markerFolders, hiddenFeatures]);
}
