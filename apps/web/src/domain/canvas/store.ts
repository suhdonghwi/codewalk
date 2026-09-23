import { create } from "zustand";

import type { ViewTransform } from "./view.ts";

const SCREEN_MARGIN = 16;

const WIDE_VIEW_X = 368;

const EDITOR_WIDTH = 448;

export type WindowId = "editor" | "stdin" | "output" | "trace";

interface WindowState {
  x: number;
  y: number;
  z: number;
}

interface CanvasState {
  view: ViewTransform;
  windows: Record<WindowId, WindowState>;
  nextZ: number;
  setView: (view: ViewTransform) => void;
  moveWindow: (id: WindowId, x: number, y: number) => void;
  bringToFront: (id: WindowId) => void;
}

export function initialView(canvasWidth: number): ViewTransform {
  const x = Math.min(WIDE_VIEW_X, canvasWidth - EDITOR_WIDTH - SCREEN_MARGIN);

  return { x: Math.max(SCREEN_MARGIN, x), y: 48, scale: 1 };
}

export const useCanvasStore = create<CanvasState>()((set) => ({
  view: initialView(Infinity),
  windows: {
    editor: { x: 0, y: 0, z: 3 },
    stdin: { x: -336, y: 0, z: 2 },
    output: { x: -336, y: 174, z: 1 },
    trace: { x: 464, y: 0, z: 4 },
  },
  nextZ: 5,
  setView: (view) => {
    set({ view });
  },
  moveWindow: (id, x, y) => {
    set((state) => ({
      windows: {
        ...state.windows,
        [id]: { ...state.windows[id], x, y },
      },
    }));
  },
  bringToFront: (id) => {
    set((state) => ({
      windows: {
        ...state.windows,
        [id]: { ...state.windows[id], z: state.nextZ },
      },
      nextZ: state.nextZ + 1,
    }));
  },
}));
