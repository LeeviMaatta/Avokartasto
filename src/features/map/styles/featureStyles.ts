import { Circle as CircleStyle, Fill, Icon, Stroke, Style } from "ol/style";

export const lineStyle = (color: string) =>
  new Style({
    stroke: new Stroke({ color, width: 3 }),
    fill: new Fill({ color: `${color}33` }),
    image: new CircleStyle({ radius: 5, fill: new Fill({ color }), stroke: new Stroke({ color: "#fff", width: 2 }) }),
  });

export const markerStyle = (color: string) =>
  new Style({
    image: new Icon({
      src: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40"><path d="M16 1C8.3 1 2 7.2 2 14.8 2 25 16 39 16 39s14-14 14-24.2C30 7.2 23.7 1 16 1z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="16" cy="15" r="5" fill="#fff"/></svg>`)}`,
      anchor: [0.5, 1],
    }),
  });
