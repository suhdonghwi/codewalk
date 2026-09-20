import { create } from "zustand";

import type { Size, ViewTransform } from "./view.ts";

const WINDOW_GAP = 16;

export type WindowId = "editor" | "stdin" | "output" | "trace";

export type ResizableWindowId = Exclude<WindowId, "trace">;

interface WindowState {
  x: number;
  y: number;
  z: number;
}

interface CanvasState {
  view: ViewTransform;
  windows: Record<WindowId, WindowState>;
  sizes: Record<ResizableWindowId, Size>;
  nextZ: number;
  setView: (view: ViewTransform) => void;
  moveWindow: (id: WindowId, x: number, y: number) => void;
  resizeWindow: (id: ResizableWindowId, size: Size) => void;
  bringToFront: (id: WindowId) => void;
}

export const useCanvasStore = create<CanvasState>()((set) => ({
  view: { x: 368, y: 48, scale: 1 },
  windows: {
    editor: { x: 0, y: 0, z: 3 },
    stdin: { x: -336, y: 0, z: 2 },
    output: { x: -336, y: 174, z: 1 },
    trace: { x: 464, y: 0, z: 4 },
  },
  sizes: {
    editor: { width: 448, height: 320 },
    stdin: { width: 320, height: 158 },
    output: { width: 320, height: 240 },
  },
  nextZ: 5,
  setView: (view) => {
    set({ view });
  },
  resizeWindow: (id, size) => {
    set((state) => {
      const sizes = { ...state.sizes, [id]: size };

      if (id !== "editor") return { sizes };

      // While the trace tree still sits at its default spot beside the editor it
      // stays docked to the editor's right edge; once either was dragged, it is
      // the user's layout and is left alone.
      const { editor, trace } = state.windows;

      const docked =
        trace.x === editor.x + state.sizes.editor.width + WINDOW_GAP &&
        trace.y === editor.y;

      return {
        sizes,
        windows: docked
          ? {
              ...state.windows,
              trace: { ...trace, x: editor.x + size.width + WINDOW_GAP },
            }
          : state.windows,
      };
    });
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
