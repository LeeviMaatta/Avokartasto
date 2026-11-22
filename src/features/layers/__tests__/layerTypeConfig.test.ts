import { afterEach, describe, expect, it, vi } from "vitest";
import VectorLayer from "ol/layer/Vector";
import ImageLayer from "ol/layer/Image";
import type { MapSource } from "../../map/model/sourceTypes";
import { buildSourceLayer } from "../../map/services/registry";
import {
  BASEMAP_LAYER_TYPES,
  OVERLAY_LAYER_TYPES,
  createDefaultNewLayerSource,
  getLayerTypeConfig,
  isNewLayerValid,
} from "../model/layerTypeConfig";

const makeSource = (overrides: Partial<MapSource>): MapSource => ({
  id: 99,
  name: "Testi",
  builtin_key: null,
  is_default: false,
  factory_json: null,
  base_path: "",
  pattern: "",
  url: "",
  projection: "EPSG:3857",
  role: "overlay",
  kind: "features",
  opacity: 1,
  min_zoom: 0,
  max_zoom: 19,
  attribution: "",
  api_type: "draw",
  tile_size: 256,
  layer_name: "",
  style: "",
  params: "{}",
  auth: "",
  note: "",
  view_zoom_offset: 0,
  view_magnification: 1,
  ...overrides,
});

describe("layerTypeConfig", () => {
  it("lists exact basemap layer types in expected order", () => {
    expect(BASEMAP_LAYER_TYPES.map((t) => t.apiType)).toEqual([
      "vector_tile",
      "xyz",
      "wmts",
      "wms",
      "local_tile",
    ]);
  });

  it("lists exact overlay layer types in expected order", () => {
    expect(OVERLAY_LAYER_TYPES.map((t) => t.apiType)).toEqual([
      "draw",
      "img",
      "geojson",
      "gpx",
      "kml",
      "wfs",
      "vector_tile",
      "xyz",
      "wmts",
      "wms",
      "local_tile",
    ]);
  });

  it("shows only relevant fields per layer type", () => {
    const drawCfg = getLayerTypeConfig("draw", "overlay");
    expect(drawCfg.showUrl).toBe(false);
    expect(drawCfg.showLocalPath).toBe(false);
    expect(drawCfg.showTileSize).toBe(false);
    expect(drawCfg.showDrawStyle).toBe(true);
    expect(drawCfg.showZoomViewSettings).toBe(false);

    const localCfg = getLayerTypeConfig("local_tile", "basemap");
    expect(localCfg.showUrl).toBe(false);
    expect(localCfg.showLocalPath).toBe(true);
    expect(localCfg.showPattern).toBe(true);
    expect(localCfg.showZoomViewSettings).toBe(true);

    const wmsCfg = getLayerTypeConfig("wms", "overlay");
    expect(wmsCfg.showUrl).toBe(true);
    expect(wmsCfg.showLayerName).toBe(true);
    expect(wmsCfg.layerNameRequired).toBe(true);
    expect(wmsCfg.showWmsFormat).toBe(true);

    const imgCfg = getLayerTypeConfig("img", "overlay");
    expect(imgCfg.showFilePicker).toBe(true);
    expect(imgCfg.fileAccept).toBe(".pdf,.jpg,.jpeg,.png");
    expect(imgCfg.showImageExtent).toBe(true);
    expect(imgCfg.showTileSize).toBe(false);
  });

  it("validates required inputs per layer type", () => {
    const draw = createDefaultNewLayerSource("overlay", "draw");
    expect(isNewLayerValid(draw)).toBe(true);
    expect(isNewLayerValid({ ...draw, name: "  " })).toBe(false);

    const wms = createDefaultNewLayerSource("overlay", "wms");
    expect(isNewLayerValid(wms)).toBe(false);
    expect(isNewLayerValid({ ...wms, url: "https://example.com/wms" })).toBe(false);
    expect(isNewLayerValid({ ...wms, url: "https://example.com/wms", layer_name: "tausta" })).toBe(true);

    const geojson = createDefaultNewLayerSource("overlay", "geojson");
    expect(isNewLayerValid(geojson)).toBe(false);
    expect(isNewLayerValid({ ...geojson, params: JSON.stringify({ inlineData: "{}" }) })).toBe(true);

    const img = createDefaultNewLayerSource("overlay", "img");
    expect(isNewLayerValid(img)).toBe(false);
    expect(
      isNewLayerValid({
        ...img,
        params: JSON.stringify({ dataUrl: "data:image/png;base64,AAA", extent: [0, 0, 10, 10] }),
      }),
    ).toBe(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds OpenLayers layers for draw and inline params sources without url or base_path", () => {
    vi.stubGlobal("Image", class {});
    const drawLayer = buildSourceLayer(
      makeSource({ id: 101, api_type: "draw", params: JSON.stringify({ strokeColor: "#2563eb", strokeWidth: 3 }) }),
      {},
    );
    expect(drawLayer).toBeInstanceOf(VectorLayer);
    expect(drawLayer?.get("drawSourceId")).toBe(101);

    const imgLayer = buildSourceLayer(
      makeSource({
        id: 102,
        api_type: "img",
        kind: "raster",
        params: JSON.stringify({ dataUrl: "data:image/png;base64,AAA", extent: [0, 0, 1000, 1000] }),
      }),
      {},
    );
    expect(imgLayer).toBeInstanceOf(ImageLayer);

    const geojsonLayer = buildSourceLayer(
      makeSource({
        id: 103,
        api_type: "geojson",
        params: JSON.stringify({
          inlineData: JSON.stringify({
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: { type: "Point", coordinates: [24.94, 60.17] }, properties: {} }],
          }),
        }),
      }),
      {},
    );
    expect(geojsonLayer).toBeInstanceOf(VectorLayer);
  });
});
