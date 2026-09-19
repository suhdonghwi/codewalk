import { create } from "zustand";

import type { ViewTransform } from "@/canvas/view.ts";
import type { RunOutcome } from "@/run/types.ts";

import { readStoredState, writeStoredState } from "./persistence.ts";

export type WindowId = "editor" | "stdin" | "output";

interface WindowState {
  x: number;
  y: number;
  z: number;
}

interface AppState {
  view: ViewTransform;
  windows: Record<WindowId, WindowState>;
  nextZ: number;
  source: string;
  stdin: string;
  outcome: RunOutcome | null;
  running: boolean;
  setView: (view: ViewTransform) => void;
  moveWindow: (id: WindowId, x: number, y: number) => void;
  bringToFront: (id: WindowId) => void;
  setSource: (source: string) => void;
  setStdin: (stdin: string) => void;
  setRunning: (running: boolean) => void;
  setOutcome: (outcome: RunOutcome) => void;
}

const initialInput = readStoredState(window.localStorage);

export const useAppStore = create<AppState>()((set, get) => ({
  view: { x: 368, y: 48, scale: 1 },
  windows: {
    editor: { x: 0, y: 0, z: 3 },
    stdin: { x: -336, y: 0, z: 2 },
    output: { x: -336, y: 177, z: 1 },
  },
  nextZ: 4,
  source: initialInput.source,
  stdin: initialInput.stdin,
  outcome: null,
  running: false,
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
  setSource: (source) => {
    const stdin = get().stdin;
    writeStoredState(window.localStorage, { source, stdin });
    set({ source });
  },
  setStdin: (stdin) => {
    const source = get().source;
    writeStoredState(window.localStorage, { source, stdin });
    set({ stdin });
  },
  setRunning: (running) => {
    set({ running });
  },
  setOutcome: (outcome) => {
    set({ outcome });
  },
}));
