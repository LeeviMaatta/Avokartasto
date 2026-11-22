import type OlMap from "ol/Map";
import TileLayer from "ol/layer/Tile";
import VectorTileLayer from "ol/layer/VectorTile";
import type ImageTile from "ol/ImageTile";
import XYZ from "ol/source/XYZ";

export function createTileDebugLayer(map: OlMap): TileLayer<XYZ> {
  const projection = map.getView().getProjection();
  const basemapLayers = map
    .getLayers()
    .getArray()
    .filter((layer) => layer.get("avokartasto-layer-type") === "basemap");
  const basemapLayer = basemapLayers[basemapLayers.length - 1];
  const basemapSource =
    basemapLayer instanceof TileLayer || basemapLayer instanceof VectorTileLayer
      ? basemapLayer.getSource()
      : null;
  const tileGrid =
    basemapSource && "getTileGridForProjection" in basemapSource
      ? (basemapSource.getTileGridForProjection(projection) ?? undefined)
      : undefined;

  const debugSource = new XYZ({
    opaque: false,
    projection,
    tileGrid,
    wrapX: true,
    url: "z:{z} x:{x} y:{y}",
    tileLoadFunction: (tile, text) => {
      const z = tile.getTileCoord()[0];
      const rawSize = (tileGrid ?? debugSource.getTileGridForProjection(projection))?.getTileSize(z) ?? 256;
      const [width, height] = Array.isArray(rawSize) ? rawSize : [rawSize, rawSize];
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.strokeStyle = "rgba(239, 68, 68, 0.78)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

        ctx.font = "bold 13px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
        ctx.lineWidth = 3.5;
        ctx.strokeText(text, width / 2, height / 2, width - 12);
        ctx.fillStyle = "rgba(185, 28, 28, 0.95)";
        ctx.fillText(text, width / 2, height / 2, width - 12);
      }
      (tile as ImageTile).setImage(canvas);
    },
  });

  const debugLayer = new TileLayer({
    className: "ol-vector-layer",
    source: debugSource,
    zIndex: 85,
  });
  debugLayer.set("avokartasto-layer-type", "debug");
  return debugLayer;
}
