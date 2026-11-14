import { useRef, useState } from "react";
import type OlMap from "ol/Map";
import type BaseLayer from "ol/layer/Base";
import type VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import type Feature from "ol/Feature";
import "ol/ol.css";
import { LocateFixed } from "lucide-react";
import { useMapStore } from "../../../store/mapStore";
import { useMapMeasurementInteractions } from "../hooks/useMapMeasurementInteractions";
import { useMapFeatures } from "../hooks/useMapFeatures";
import { useMapLayers } from "../hooks/useMapLayers";
import { useOlMapInstance } from "../hooks/useOlMapInstance";
import { useMapControlsSync } from "../hooks/useMapControlsSync";
import { useMapNavigation } from "../hooks/useMapNavigation";
import { useMapVectorInteractions, type ContextMenuTarget } from "../hooks/useMapVectorInteractions";
import FeatureContextMenu from "./FeatureContextMenu";
import { useDebugStore } from "../../debug/model/debugStore";

export default function MapContainer() {
  const el = useRef<HTMLDivElement>(null);
  const bottomRightRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OlMap | null>(null);
  const overlayRefs = useRef<BaseLayer[]>([]);
  const measureSrc = useRef(new VectorSource());
  const featSrc = useRef(new VectorSource());
  const routeSrc = useRef(new VectorSource());
  const pendingMarkerFeature = useRef<Feature | null>(null);
  const profileRequest = useRef(0);
  const viewRestored = useRef(false);
  const heldKeysByCode = useRef<Map<string, string>>(new Map());
  const measureLayerRef = useRef<VectorLayer<Feature> | null>(null);

  const basemap = useMapStore((s) => s.basemap);
  const overlays = useMapStore((s) => s.overlays);
  const overlayOrder = useMapStore((s) => s.overlayOrder);
  const settings = useMapStore((s) => s.settings);
  const sources = useMapStore((s) => s.sources);
  const tool = useMapStore((s) => s.tool);
  const routePoints = useMapStore((s) => s.routePoints);
  const routeResult = useMapStore((s) => s.routeResult);
  const routePickTarget = useMapStore((s) => s.routePickTarget);
  const pendingMarker = useMapStore((s) => s.pendingMarker);
  const featuresVersion = useMapStore((s) => s.featuresVersion);
  const editingFeatureId = useMapStore((s) => s.editingFeatureId);
  const activeUnsavedMeasurementId = useMapStore((s) => s.activeUnsavedMeasurementId);
  const hiddenFeaturesSetting = useMapStore((s) => s.settings.hiddenFeatures);
  const showTileBoundaries = useDebugStore((s) => Boolean(s.settings.showTileBoundaries));

  const showCenterCrosshair = settings.showCenterCrosshair !== "0";
  const showLayerErrors = settings.showLayerErrors !== "0";
  const crosshairColor = settings.crosshairColor || "#dc2626";
  const rawOverlayOpacity = Number(settings.uiOverlayOpacity ?? "1");
  const overlayOpacity = Number.isFinite(rawOverlayOpacity) ? Math.min(1, Math.max(0, rawOverlayOpacity)) : 1;

  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);

  useOlMapInstance({
    elRef: el,
    bottomRightRef,
    mapRef,
    measureLayerRef,
    featSrc,
    measureSrc,
    routeSrc,
    viewRestored,
    heldKeysByCode,
  });

  const { baseLayerError } = useMapLayers({ mapRef, overlayRefs, basemap, overlays, overlayOrder, settings, sources });

  useMapControlsSync({
    mapRef,
    bottomRightRef,
    measureLayerRef,
    featSrc,
    settings,
    basemap,
    sources,
    showTileBoundaries,
    editingFeatureId,
    activeUnsavedMeasurementId,
  });

  const { locating, geoError, setGeoError, handleLocateUser } = useMapNavigation({
    mapRef,
    elRef: el,
    featSrc,
    viewRestored,
    heldKeysByCode,
    settings,
  });

  useMapVectorInteractions({
    mapRef,
    elRef: el,
    measureSrc,
    featSrc,
    routeSrc,
    pendingMarkerFeature,
    profileRequest,
    setContextMenu,
    tool,
    routePoints,
    routeResult,
    routePickTarget,
    pendingMarker,
    hiddenFeaturesSetting,
    markerFoldersSetting: settings.markerFolders,
  });

  useMapFeatures({
    featureSource: featSrc,
    featuresVersion,
    markerFolders: settings.markerFolders ?? "[]",
    hiddenFeatures: hiddenFeaturesSetting ?? "[]",
    editingFeatureId,
  });

  useMapMeasurementInteractions({
    mapRef,
    measureSource: measureSrc,
    profileRequest,
    tool,
    measurementType: settings.measurementType ?? "distance",
    editingFeatureId,
    activeUnsavedMeasurementId,
  });

  return (
    <div className="relative h-full w-full">
      <div
        ref={el}
        tabIndex={0}
        data-map-viewport="true"
        aria-label="Karttanäkymä"
        className="absolute inset-0 outline-none"
        style={{ cursor: tool === "measure" ? "crosshair" : "default" }}
      />
      {showCenterCrosshair && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-20" style={{ opacity: overlayOpacity }}>
          <div className="relative flex items-center justify-center">
            <div className="absolute h-5 w-[2px]" style={{ backgroundColor: crosshairColor }}></div>
            <div className="absolute w-5 h-[2px]" style={{ backgroundColor: crosshairColor }}></div>
          </div>
        </div>
      )}
      {showLayerErrors && baseLayerError && (
        <div className="absolute left-3 right-3 top-3 z-30 rounded bg-red-700 px-3 py-2 text-xs text-white shadow-lg" style={{ opacity: overlayOpacity }}>
          Karttatason lataus: {baseLayerError}
        </div>
      )}
      {geoError && (
        <div className="absolute bottom-14 right-3 z-30 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-xs text-amber-900 shadow-lg backdrop-blur dark:border-amber-700/60 dark:bg-zinc-900/95 dark:text-amber-300" style={{ opacity: overlayOpacity }}>
          <span>{geoError}</span>
          <button type="button" onClick={() => setGeoError(null)} className="font-semibold underline hover:opacity-80">Sulje</button>
        </div>
      )}

      <div
        ref={bottomRightRef}
        className="map-bottom-right pointer-events-none absolute bottom-3 right-3 z-10 flex flex-col-reverse items-end gap-2"
        style={{ opacity: overlayOpacity }}
      >
        {settings.showGeolocation !== "0" && (
          <button
            type="button"
            className="map-geoloc-btn flex h-7 w-7 items-center justify-center rounded-sm border border-slate-300 bg-white/95 text-slate-700 shadow-md backdrop-blur transition hover:bg-slate-100 hover:text-blue-600 dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
            onClick={handleLocateUser}
            title="Oma sijainti (paikanna)"
            aria-label="Paikanna oma sijainti"
          >
            <LocateFixed size={16} className={locating ? "animate-spin text-blue-600" : ""} />
          </button>
        )}
      </div>

      <FeatureContextMenu value={contextMenu} opacity={overlayOpacity} measureSource={measureSrc.current} profileRequest={profileRequest} onClose={() => setContextMenu(null)} />
    </div>
  );
}
