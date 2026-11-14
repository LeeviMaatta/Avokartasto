import { useEffect, type RefObject } from "react";
import type OlMap from "ol/Map";
import TileLayer from "ol/layer/Tile";
import TileWMS from "ol/source/TileWMS";
import { buildCopernicusWmsParams } from "../services/copernicusParams";

export function useCopernicusSync(
  mapRef: RefObject<OlMap | null>,
  basemap: string,
  overlays: string[],
  settings: Record<string, string>,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextParams = buildCopernicusWmsParams(settings);
    map.getLayers().getArray().forEach((item) => {
      if (!item.get("isCopernicus") || !(item instanceof TileLayer)) return;
      const src = item.getSource();
      if (src instanceof TileWMS) {
        src.updateParams(nextParams);
      }
    });
  }, [
    mapRef,
    basemap,
    overlays,
    settings.copernicusLayerName,
    settings.copernicusMaxCloud,
    settings.copernicusDateMode,
    settings.copernicusSingleDate,
    settings.copernicusRangeStart,
    settings.copernicusRangeEnd,
    settings.copernicusRangeYear,
    settings.copernicusRangeSelectedDate,
  ]);
}
