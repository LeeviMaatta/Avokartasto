import Point from "ol/geom/Point";
import { Fill, Stroke, Style, Text } from "ol/style";
import type { UiStyle } from "../../settings/model/settingTypes";

interface BadgeStyleTokens {
  font: string;
  textColor: string;
  haloColor: string;
  bgColor: string;
  borderColor: string;
  borderWidth: number;
  padding: [number, number, number, number];
}

const BADGE_PALETTE: Record<UiStyle, Record<"light" | "dark", BadgeStyleTokens>> = {
  modern: {
    light: {
      font: '600 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      textColor: "#0f172a",
      haloColor: "#ffffff",
      bgColor: "rgba(255, 255, 255, 0.95)",
      borderColor: "#cbd5e1",
      borderWidth: 1,
      padding: [3, 6, 2, 6],
    },
    dark: {
      font: '600 11px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      textColor: "#f4f4f5",
      haloColor: "#09090b",
      bgColor: "rgba(9, 9, 11, 0.92)",
      borderColor: "#3f3f46",
      borderWidth: 1,
      padding: [3, 6, 2, 6],
    },
  },
  classic: {
    light: {
      font: "bold 11px system-ui, -apple-system, sans-serif",
      textColor: "#1e293b",
      haloColor: "#ffffff",
      bgColor: "rgba(255, 255, 255, 0.96)",
      borderColor: "#94a3b8",
      borderWidth: 1,
      padding: [2, 4, 1, 4],
    },
    dark: {
      font: "bold 11px system-ui, -apple-system, sans-serif",
      textColor: "#f4f4f5",
      haloColor: "#18181b",
      bgColor: "rgba(24, 24, 27, 0.95)",
      borderColor: "#52525b",
      borderWidth: 1,
      padding: [2, 4, 1, 4],
    },
  },
  retro: {
    light: {
      font: 'bold 11px "MS Sans Serif", Tahoma, Geneva, "Segoe UI", sans-serif',
      textColor: "#000000",
      haloColor: "#d4d0c8",
      bgColor: "#d4d0c8",
      borderColor: "#404040",
      borderWidth: 1.5,
      padding: [2, 5, 2, 5],
    },
    dark: {
      font: 'bold 11px "MS Sans Serif", Tahoma, Geneva, "Segoe UI", sans-serif',
      textColor: "#f0f0f0",
      haloColor: "#2b2b2b",
      bgColor: "#2b2b2b",
      borderColor: "#666666",
      borderWidth: 1.5,
      padding: [2, 5, 2, 5],
    },
  },
};

/** Creates a themed OpenLayers badge style for a measurement segment or total distance label. */
export function createDistanceBadgeStyle(
  coord: number[],
  label: string,
  theme: "light" | "dark" = "light",
  uiStyle: UiStyle = "modern",
): Style {
  const palette = (BADGE_PALETTE[uiStyle] ?? BADGE_PALETTE.modern)[theme === "dark" ? "dark" : "light"];
  return new Style({
    geometry: new Point(coord),
    text: new Text({
      text: label,
      font: palette.font,
      fill: new Fill({ color: palette.textColor }),
      stroke: new Stroke({ color: palette.haloColor, width: 2 }),
      backgroundFill: new Fill({ color: palette.bgColor }),
      backgroundStroke: new Stroke({ color: palette.borderColor, width: palette.borderWidth }),
      padding: palette.padding,
      offsetY: -7,
    }),
  });
}
