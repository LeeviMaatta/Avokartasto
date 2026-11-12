import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapPin } from "lucide-react";
import { Circle as CircleStyle, Fill, Icon, Stroke, Style, Text } from "ol/style";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import { getLength } from "ol/sphere";
import { formatDistance } from "../../measurements/domain/measurementFormatting";
import type { UiStyle } from "../../settings/model/settingTypes";

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

const markerStyleCache = new Map<string, Style>();

function buildMarkerSvg(color: string, theme: "light" | "dark"): string {
  const inner = theme === "dark" ? "#e4e4e7" : "#ffffff";
  const svg = renderToStaticMarkup(
    createElement(MapPin, {
      size: 32,
      color,
      fill: color,
      strokeWidth: 2,
    }),
  );
  return svg.replace("<circle ", `<circle stroke="${inner}" `);
}

export const markerStyle = (
  color: string,
  _uiStyle: UiStyle = "modern",
  theme: "light" | "dark" = "light",
) => {
  const key = `${color}:${theme}`;
  const cached = markerStyleCache.get(key);
  if (cached) return cached;
  const style = new Style({
    image: new Icon({
      src: `data:image/svg+xml,${encodeURIComponent(buildMarkerSvg(color, theme))}`,
      anchor: [0.5, 0.92],
    }),
  });
  markerStyleCache.set(key, style);
  return style;
};
