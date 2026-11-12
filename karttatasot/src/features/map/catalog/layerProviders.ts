import TileLayer from "ol/layer/Tile";
import XYZ from "ol/source/XYZ";
import TileWMS from "ol/source/TileWMS";
import ImageTile from "ol/ImageTile";
import type Tile from "ol/Tile";
import { fetchLantmaterietTile, inTauri, lantmaterietTileUrl, tileUrl } from "../../../infrastructure/tauriBridge";

const MML_ATTR = "© Maanmittauslaitos";

export const createRemoteTileLayer = (url: string, attributions?: string, maxZoom = 19) =>
  new TileLayer({
    source: new XYZ({ url, attributions, maxZoom, crossOrigin: "anonymous" }),
  });

export const createMmlLayer = (layer: string, ext: string, key: string, maxZoom: number) =>
  createRemoteTileLayer(
    `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/${layer}/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.${ext}?api-key=${key}`,
    MML_ATTR,
    maxZoom,
  );

export const createLantmaterietLayer = () =>
  new TileLayer({
    source: new XYZ({
      url: "https://lantmateriet.invalid/{z}/{x}/{y}.png",
      attributions: "© Lantmäteriet",
      maxZoom: 14,
      crossOrigin: "anonymous",
      tileLoadFunction: (tile: Tile, src: string) => {
        const image = (tile as ImageTile).getImage() as HTMLImageElement;
        if (!inTauri()) {
          image.src = lantmaterietTileUrl();
          return;
        }
        const match = src.match(/\/(\d+)\/(\d+)\/(-?\d+)\.png$/);
        if (!match) {
          image.dispatchEvent(new Event("error"));
          return;
        }
        const [, z, x, y] = match;
        void fetchLantmaterietTile(Number(z), Number(x), Number(y))
          .then((bytes) => {
            const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
            image.onload = () => URL.revokeObjectURL(objectUrl);
            image.src = objectUrl;
          })
          .catch(() => image.dispatchEvent(new Event("error")));
      },
    }),
  });

export const createLocalLayer = (source: {
  id: number;
  name: string;
  base_path: string;
  attribution: string;
  max_zoom: number;
  tile_size: number;
  api_type: "tile" | "wms";
  layer_name: string;
  style: string;
  opacity: number;
}) => {
  const layer = new TileLayer({
    source: source.api_type === "wms"
      ? new TileWMS({
        url: source.base_path,
        params: { LAYERS: source.layer_name, STYLES: source.style, TILED: true },
        attributions: source.attribution || source.name,
        crossOrigin: "anonymous",
      })
      : new XYZ({
        url: tileUrl(source.id),
        attributions: source.attribution || source.name,
        maxZoom: source.max_zoom,
        tileSize: source.tile_size,
        crossOrigin: "anonymous",
      }),
  });
  layer.setOpacity(source.opacity);
  return layer;
};
