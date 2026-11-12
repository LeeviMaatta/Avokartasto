import { Circle as CircleStyle, Fill, Icon, Stroke, Style, Text } from "ol/style";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import { getLength } from "ol/sphere";
import { formatDistance } from "../../measurements/domain/measurementFormatting";

export const lineStyle = (color: string) =>
  new Style({
    stroke: new Stroke({ color, width: 3 }),
    fill: new Fill({ color: `${color}33` }),
    image: new CircleStyle({ radius: 5, fill: new Fill({ color }), stroke: new Stroke({ color: "#fff", width: 2 }) }),
  });

export const measurementStyle = (color: string, showSegments: boolean, units = "metric") => {
  const base = lineStyle(color);
  return (feature: any) => {
    const geom = feature?.getGeometry?.();
    if (!geom) return base;
    const styles: Style[] = [base];

    if (showSegments && geom instanceof LineString) {
      const coords = geom.getCoordinates();
      if (coords.length >= 2) {
        for (let i = 0; i < coords.length - 1; i++) {
          const c1 = coords[i];
          const c2 = coords[i + 1];
          const segGeom = new LineString([c1, c2]);
          const length = getLength(segGeom, { projection: "EPSG:3857" });
          if (length > 2) {
            const mid = [(c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2];
            styles.push(
              new Style({
                geometry: new Point(mid),
                text: new Text({
                  text: formatDistance(length, units),
                  font: "bold 11px system-ui, -apple-system, sans-serif",
                  fill: new Fill({ color: "#0f172a" }),
                  stroke: new Stroke({ color: "#ffffff", width: 3 }),
                  backgroundFill: new Fill({ color: "rgba(255, 255, 255, 0.9)" }),
                  backgroundStroke: new Stroke({ color: "#94a3b8", width: 1 }),
                  padding: [2, 4, 1, 4],
                  offsetY: -7,
                }),
              }),
            );
          }
        }
      }
    }
    return styles;
  };
};

export const markerStyle = (color: string) =>
  new Style({
    image: new Icon({
      src: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40"><path d="M16 1C8.3 1 2 7.2 2 14.8 2 25 16 39 16 39s14-14 14-24.2C30 7.2 23.7 1 16 1z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="16" cy="15" r="5" fill="#fff"/></svg>`)}`,
      anchor: [0.5, 1],
    }),
  });
