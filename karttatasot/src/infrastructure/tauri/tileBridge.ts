import { invokeTauri, inTauri } from "./runtime";

export { inTauri };

export const tileUrl = (id: number) =>
  navigator.userAgent.includes("Windows")
    ? `http://app-tile.localhost/${id}/{z}/{x}/{y}`
    : `app-tile://localhost/${id}/{z}/{x}/{y}`;

export const lantmaterietTileUrl = () =>
  navigator.userAgent.includes("Windows")
    ? "http://lantmateriet-tile.localhost/{z}/{x}/{y}.png"
    : "lantmateriet-tile://localhost/{z}/{x}/{y}.png";

export const fetchLantmaterietTile = (z: number, x: number, y: number) =>
  invokeTauri<number[]>("fetch_lantmateriet_tile", { z, x, y });
