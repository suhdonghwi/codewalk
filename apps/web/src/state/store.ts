import { create } from "zustand";

import type { ViewTransform } from "@/canvas/view.ts";
import type { RunOutcome } from "@/run/types.ts";
import {
  navigateToException,
  navigateToOutput,
  type Focus,
} from "@/trace-tree/navigation.ts";
import { initialPath, type Path } from "@/trace-tree/path.ts";

import type { NodeId } from "@codewalk/trace";

import { readStoredState, writeStoredState } from "./persistence.ts";

export type WindowId = "editor" | "stdin" | "output" | "trace";

interface WindowState {
  x: number;
  y: number;
  z: number;
}

interface PendingReveal {
  block: NodeId;
  focusLine: boolean;
}

interface AppState {
  view: ViewTransform;
  windows: Record<WindowId, WindowState>;
  nextZ: number;
  source: string;
  stdin: string;
  outcome: RunOutcome | null;
  running: boolean;
  path: Path;
  focus: Focus | null;
  pendingReveal: PendingReveal | null;
  setView: (view: ViewTransform) => void;
  moveWindow: (id: WindowId, x: number, y: number) => void;
  bringToFront: (id: WindowId) => void;
  setSource: (source: string) => void;
  setStdin: (stdin: string) => void;
  setRunning: (running: boolean) => void;
  setOutcome: (outcome: RunOutcome) => void;
  setPath: (path: Path, reveal: PendingReveal | null) => void;
  focusOutput: (chunk: number) => void;
  clearReveal: (reveal: PendingReveal) => void;
}

const initialInput = readStoredState(window.localStorage);

export const useAppStore = create<AppState>()((set, get) => ({
  view: { x: 368, y: 48, scale: 1 },
  windows: {
    editor: { x: 0, y: 0, z: 3 },
    stdin: { x: -336, y: 0, z: 2 },
    output: { x: -336, y: 177, z: 1 },
    trace: { x: 576, y: 0, z: 4 },
  },
  nextZ: 5,
  source: initialInput.source,
  stdin: initialInput.stdin,
  outcome: null,
  running: false,
  path: [],
  focus: null,
  pendingReveal: null,
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
    const navigation =
      outcome.kind === "trace" ? navigateToException(outcome.trace) : null;

    set({
      outcome,
      path:
        navigation?.path ??
        (outcome.kind === "trace" ? initialPath(outcome.trace) : []),
      focus: navigation?.focus ?? null,
      // A run never pans the canvas: an exception opens and focuses its path,
      // but the editor the user has to go back to stays where it is. Only an
      // explicit click (output, site, sibling) asks for a reveal.
      pendingReveal: null,
    });
  },
  setPath: (path, reveal) => {
    set({ path, pendingReveal: reveal });
  },
  focusOutput: (chunk) => {
    const outcome = get().outcome;

    if (outcome?.kind !== "trace") return;
    const navigation = navigateToOutput(outcome.trace, chunk);

    set({
      path: navigation.path,
      focus: navigation.focus,
      pendingReveal: { block: navigation.focus.block, focusLine: true },
    });
  },
  clearReveal: (reveal) => {
    set((state) =>
      state.pendingReveal === reveal ? { pendingReveal: null } : state,
    );
  },
}));
