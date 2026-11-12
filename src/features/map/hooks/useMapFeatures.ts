import { useEffect, type MutableRefObject } from "react";
import GeoJSON from "ol/format/GeoJSON";
import VectorSource from "ol/source/Vector";
import { listFeatures } from "../../../infrastructure/tauriBridge";

interface MapFeaturesOptions {
  featureSource: MutableRefObject<VectorSource>;
  featuresVersion: number;
  markerFolders: string;
  hiddenFeatures: string;
  editingFeatureId?: number | null;
}

export function useMapFeatures({ featureSource, featuresVersion, markerFolders, hiddenFeatures, editingFeatureId }: MapFeaturesOptions) {
  useEffect(() => {
    let cancelled = false;
    void listFeatures().then((rows) => {
      if (cancelled) return;
      featureSource.current.clear();
      const format = new GeoJSON();
      const knownFolders = new Set<string>();
      const visibleFolders = new Set<string>();
      let hiddenFeatureIds = new Set<number>();
      try {
        const folders = JSON.parse(markerFolders) as Array<{ id?: string; visible?: boolean }>;
        if (Array.isArray(folders)) {
          folders.forEach((folder) => {
            if (typeof folder?.id === "string") {
              knownFolders.add(folder.id);
              if (folder.visible !== false) visibleFolders.add(folder.id);
            }
          });
        }
      } catch {
        // Sivuutetaan virheellinen JSON
      }
      try {
        const ids = JSON.parse(hiddenFeatures);
        if (Array.isArray(ids)) hiddenFeatureIds = new Set(ids.filter((id): id is number => Number.isInteger(id)));
      } catch {
        hiddenFeatureIds = new Set();
      }
      rows.forEach((row) => {
        if (hiddenFeatureIds.has(row.id) || row.id === editingFeatureId) return;
        if (row.folder_id && knownFolders.has(row.folder_id) && !visibleFolders.has(row.folder_id)) return;
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
    return () => {
      cancelled = true;
    };
  }, [featureSource, featuresVersion, markerFolders, hiddenFeatures, editingFeatureId]);
}
