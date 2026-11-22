import type { MutableRefObject } from "react";
import LineString from "ol/geom/LineString";
import { toLonLat } from "ol/proj";
import { getLength } from "ol/sphere";
import { useMapStore } from "../../../store/mapStore";
import { elevationBatch } from "../../location-info/services/elevationService";

/** Fetches elevation samples along `geom` and updates the store's profile if still current. */
export async function fetchLineElevationProfile(
  geom: LineString,
  profileRequest: MutableRefObject<number>,
): Promise<void> {
  const length = getLength(geom, { projection: "EPSG:3857" });
  const reqId = ++profileRequest.current;
  const n = Math.min(100, Math.max(2, Math.ceil(length / 100) + 1));
  const fractions = Array.from({ length: n }, (_, index) => index / (n - 1));
  const points = fractions.map(
    (fraction) => toLonLat(geom.getCoordinateAt(fraction)) as [number, number],
  );
  try {
    const elevations = await elevationBatch(points);
    if (reqId !== profileRequest.current) return;
    useMapStore.setState({
      profile: fractions.map((fraction, index) => ({
        dist: fraction * length,
        elev: elevations[index],
      })),
      profileVisible: false,
    });
  } catch (err) {
    if (reqId === profileRequest.current) useMapStore.setState({ profileError: String(err) });
  }
}
