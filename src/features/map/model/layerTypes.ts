import type TileLayer from "ol/layer/Tile";
import type { Settings } from "../../settings/model/settingTypes";

export interface LayerDef {
  id: string;
  name: string;
  needs?: "mmlKey" | "lantmaterietUsername" | "owmKey";
  note?: string;
  create: (settings: Settings) => TileLayer<any>;
}
