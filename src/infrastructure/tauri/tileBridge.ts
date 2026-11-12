import { invokeTauri, inTauri } from "./runtime";

export { inTauri };

export const tileUrl = (id: number) =>
  navigator.userAgent.includes("Windows")
    ? `http://app-tile.localhost/${id}/{z}/{x}/{y}`
    : `app-tile://localhost/${id}/{z}/{x}/{y}`;

export const remoteTileUrl = (id: number) =>
  navigator.userAgent.includes("Windows")
    ? `http://remote-tile.localhost/${id}/{z}/{x}/{y}.png`
    : `remote-tile://localhost/${id}/{z}/{x}/{y}.png`;

export const fetchRemoteTile = (sourceId: number, z: number, x: number, y: number) =>
  invokeTauri<number[]>("fetch_remote_tile", { sourceId, z, x, y });
