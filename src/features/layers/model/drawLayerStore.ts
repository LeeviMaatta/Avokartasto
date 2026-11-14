import { create } from "zustand";

export type DrawLayerTool = "freehand" | "LineString" | "Polygon" | "Point" | "modify";

const DEFAULT_FINLAND_EXTENT_3857: [number, number, number, number] = [2100000, 8300000, 3500000, 10800000];

interface DrawLayerState {
  activeDrawSourceId: number | null;
  drawTool: DrawLayerTool;
  strokeColor: string;
  strokeWidth: number;
  adjustingImageSourceId: number | null;
  currentViewExtent3857: [number, number, number, number];
  undoNonce: number;

  startDrawingLayer: (sourceId: number, color?: string, width?: number) => void;
  stopDrawingLayer: () => void;
  setDrawTool: (tool: DrawLayerTool) => void;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  requestUndo: () => void;
  setAdjustingImageSourceId: (id: number | null) => void;
  setCurrentViewExtent3857: (extent: [number, number, number, number]) => void;
}

export const useDrawLayerStore = create<DrawLayerState>((set) => ({
  activeDrawSourceId: null,
  drawTool: "freehand",
  strokeColor: "#2563eb",
  strokeWidth: 3,
  adjustingImageSourceId: null,
  currentViewExtent3857: DEFAULT_FINLAND_EXTENT_3857,
  undoNonce: 0,

  startDrawingLayer: (sourceId, color, width) =>
    set({
      activeDrawSourceId: sourceId,
      adjustingImageSourceId: null,
      ...(color ? { strokeColor: color } : {}),
      ...(width ? { strokeWidth: width } : {}),
    }),
  stopDrawingLayer: () => set({ activeDrawSourceId: null }),
  setDrawTool: (drawTool) => set({ drawTool }),
  setStrokeColor: (strokeColor) => set({ strokeColor }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  requestUndo: () => set((state) => ({ undoNonce: state.undoNonce + 1 })),
  setAdjustingImageSourceId: (adjustingImageSourceId) =>
    set({
      adjustingImageSourceId,
      ...(adjustingImageSourceId !== null ? { activeDrawSourceId: null } : {}),
    }),
  setCurrentViewExtent3857: (currentViewExtent3857) => set({ currentViewExtent3857 }),
}));
