import { create } from "zustand";

import type { Size, ViewTransform } from "./view.ts";

const WINDOW_GAP = 16;

export type WindowId = "editor" | "stdin" | "output" | "trace";

interface WindowState {
  x: number;
  y: number;
  z: number;
}

interface CanvasState {
  view: ViewTransform;
  windows: Record<WindowId, WindowState>;
  editorSize: Size;
  nextZ: number;
  setView: (view: ViewTransform) => void;
  moveWindow: (id: WindowId, x: number, y: number) => void;
  resizeEditor: (size: Size) => void;
  bringToFront: (id: WindowId) => void;
}

export const useCanvasStore = create<CanvasState>()((set) => ({
  view: { x: 368, y: 48, scale: 1 },
  windows: {
    editor: { x: 0, y: 0, z: 3 },
    stdin: { x: -336, y: 0, z: 2 },
    output: { x: -336, y: 177, z: 1 },
    trace: { x: 576, y: 0, z: 4 },
  },
  editorSize: { width: 560, height: 320 },
  nextZ: 5,
  setView: (view) => {
    set({ view });
  },
  resizeEditor: (editorSize) => {
    set((state) => {
      // While the trace tree still sits at its default spot beside the editor it
      // stays docked to the editor's right edge; once either was dragged, it is
      // the user's layout and is left alone.
      const { editor, trace } = state.windows;

      const docked =
        trace.x === editor.x + state.editorSize.width + WINDOW_GAP &&
        trace.y === editor.y;

      return {
        editorSize,
        windows: docked
          ? {
              ...state.windows,
              trace: { ...trace, x: editor.x + editorSize.width + WINDOW_GAP },
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
