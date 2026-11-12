import Feature from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import LineString from "ol/geom/LineString";
import Point from "ol/geom/Point";
import Polygon from "ol/geom/Polygon";
import VectorSource from "ol/source/Vector";
import { getArea, getLength } from "ol/sphere";
import { Trash2 } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { deleteFeature } from "../../../infrastructure/tauriBridge";
import { requestConfirmation } from "../../../app/confirmation";

type ContextMenuState = { feature: Feature; x: number; y: number; savedId?: number };

interface FeatureContextMenuProps {
  value: ContextMenuState | null;
  opacity: number;
  measureSource: VectorSource;
  profileRequest: { current: number };
  onClose: () => void;
}

export default function FeatureContextMenu({ value, opacity, measureSource, profileRequest, onClose }: FeatureContextMenuProps) {
  if (!value) return null;
  const geometry = value.feature.getGeometry();
  return (
    <div style={{ top: value.y, left: value.x, opacity }} data-feature-context-menu className="absolute z-40 rounded-lg border border-gray-700 bg-white py-1 text-xs shadow-xl dark:bg-gray-800 dark:text-white">
      <button
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[#1671a8] hover:bg-gray-100"
        onClick={() => {
          if (!geometry) return;
          if (geometry instanceof Point) {
            onClose();
            return;
          }
          if (value.savedId) {
            measureSource.clear();
            const editable = value.feature.clone();
            editable.set("id", value.savedId);
            measureSource.addFeature(editable);
            const kind = geometry instanceof Polygon ? "area" : "distance";
            const length = kind === "area" ? getArea(geometry, { projection: "EPSG:3857" }) : geometry instanceof LineString ? getLength(geometry, { projection: "EPSG:3857" }) : 0;
            const geojson = new GeoJSON().writeGeometry(geometry, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });
            useMapStore.setState({ tool: "measure", editingFeatureId: value.savedId, measure: { length, geojson, kind }, profile: null, profileVisible: false, profileError: null });
          } else {
            useMapStore.setState({ tool: "measure" });
          }
          onClose();
        }}
      >
        {geometry instanceof Point ? "Valittu merkki" : "Muokkaa mittausta"}
      </button>
      {geometry && !(geometry instanceof Point) && (
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-600 hover:bg-gray-100 dark:text-red-400 dark:hover:bg-gray-700"
          onClick={async () => {
            if (!(await requestConfirmation("Haluatko varmasti poistaa tämän mittauksen?"))) return;
            if (value.savedId) void deleteFeature(value.savedId).then(() => useMapStore.getState().bumpFeatures());
            else measureSource.removeFeature(value.feature);
            profileRequest.current += 1;
            useMapStore.setState({ measure: null, profile: null, profileVisible: false, profileError: null });
            onClose();
          }}
        >
          <Trash2 size={13} /> Poista mittaus
        </button>
      )}
    </div>
  );
}
