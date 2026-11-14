import Point from "ol/geom/Point";
import { Fill, Stroke, Style, Text } from "ol/style";
import type { UiStyle } from "../../settings/model/settingTypes";

interface BadgeStyleTokens {
  font: string;
  fontSize: number;
  textColor: string;
  bgColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  padX: number;
  padY: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

const MONO_FONT =
  '600 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const RETRO_FONT = '600 12px "MS Sans Serif", Tahoma, Geneva, "Segoe UI", sans-serif';

const BADGE_PALETTE: Record<UiStyle, Record<"light" | "dark", BadgeStyleTokens>> = {
  modern: {
    light: {
      font: MONO_FONT,
      fontSize: 12,
      textColor: "#0f172a",
      bgColor: "rgba(255, 255, 255, 0.95)",
      borderColor: "#cbd5e1",
      borderWidth: 1,
      borderRadius: 8,
      padX: 8,
      padY: 4,
      shadowColor: "rgba(15, 23, 42, 0.16)",
      shadowBlur: 6,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
    },
    dark: {
      font: MONO_FONT,
      fontSize: 12,
      textColor: "#f4f4f5",
      bgColor: "rgba(9, 9, 11, 0.95)",
      borderColor: "#3f3f46",
      borderWidth: 1,
      borderRadius: 8,
      padX: 8,
      padY: 4,
      shadowColor: "rgba(0, 0, 0, 0.45)",
      shadowBlur: 6,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
    },
  },
  classic: {
    light: {
      font: MONO_FONT,
      fontSize: 12,
      textColor: "#0f172a",
      bgColor: "rgba(255, 255, 255, 0.95)",
      borderColor: "#cbd5e1",
      borderWidth: 1,
      borderRadius: 3,
      padX: 8,
      padY: 4,
      shadowColor: "rgba(15, 23, 42, 0.16)",
      shadowBlur: 6,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
    },
    dark: {
      font: MONO_FONT,
      fontSize: 12,
      textColor: "#f4f4f5",
      bgColor: "rgba(9, 9, 11, 0.95)",
      borderColor: "#3f3f46",
      borderWidth: 1,
      borderRadius: 3,
      padX: 8,
      padY: 4,
      shadowColor: "rgba(0, 0, 0, 0.45)",
      shadowBlur: 6,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
    },
  },
  retro: {
    light: {
      font: RETRO_FONT,
      fontSize: 12,
      textColor: "#000000",
      bgColor: "#d4d0c8",
      borderColor: "#404040",
      borderWidth: 1,
      borderRadius: 0,
      padX: 8,
      padY: 4,
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
    },
    dark: {
      font: RETRO_FONT,
      fontSize: 12,
      textColor: "#f0f0f0",
      bgColor: "#2b2b2b",
      borderColor: "#666666",
      borderWidth: 1,
      borderRadius: 0,
      padX: 8,
      padY: 4,
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOffsetX: 2,
      shadowOffsetY: 2,
    },
  },
};

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  if (radius > 0 && typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.rect(x, y, width, height);
  }
}

/** Creates a themed OpenLayers badge style for a measurement segment or total distance label. */
export function createDistanceBadgeStyle(
  coord: number[],
  label: string,
  theme: "light" | "dark" = "light",
  uiStyle: UiStyle = "modern",
): Style {
  const palette = (BADGE_PALETTE[uiStyle] ?? BADGE_PALETTE.modern)[theme === "dark" ? "dark" : "light"];
  const offsetY = -7;

  return new Style({
    geometry: new Point(coord),
    text: new Text({
      text: label,
      font: palette.font,
      fill: new Fill({ color: palette.textColor }),
      backgroundFill: new Fill({ color: palette.bgColor }),
      backgroundStroke: new Stroke({ color: palette.borderColor, width: palette.borderWidth }),
      padding: [palette.padY, palette.padX, palette.padY, palette.padX],
      offsetY,
    }),
    renderer(pixelCoordinates, state) {
      const raw = pixelCoordinates as number[];
      const x = raw[0];
      const y = raw[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;

      const ctx = state.context;
      const dpr = state.pixelRatio || 1;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(dpr, dpr);

      ctx.font = palette.font;
      const textWidth = ctx.measureText(label).width;
      const boxWidth = Math.ceil(textWidth + palette.padX * 2);
      const boxHeight = Math.ceil(palette.fontSize + palette.padY * 2 + 2);
      const boxX = -boxWidth / 2;
      const boxY = offsetY - boxHeight / 2;

      ctx.shadowColor = palette.shadowColor;
      ctx.shadowBlur = palette.shadowBlur;
      ctx.shadowOffsetX = palette.shadowOffsetX;
      ctx.shadowOffsetY = palette.shadowOffsetY;
      ctx.fillStyle = palette.bgColor;
      traceRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, palette.borderRadius);
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = palette.borderColor;
      ctx.lineWidth = palette.borderWidth;
      traceRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, palette.borderRadius);
      ctx.stroke();

      ctx.fillStyle = palette.textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, offsetY + 0.5);

      ctx.restore();
    },
  });
}
