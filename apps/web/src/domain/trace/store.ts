import type { NodeId, Trace } from "@codewalk/trace";
import { create } from "zustand";

import {
  navigateToException,
  navigateToOutput,
  type Focus,
} from "./tree/navigation.ts";
import { initialPath, type Path } from "./tree/path.ts";

interface PendingReveal {
  block: NodeId;
  focusLine: boolean;
}

interface TraceState {
  path: Path;
  focus: Focus | null;
  pendingReveal: PendingReveal | null;
  setPath: (path: Path, reveal: PendingReveal | null) => void;
  clearReveal: (reveal: PendingReveal) => void;
  focusOutput: (trace: Trace, chunk: number) => void;
  resetForTrace: (trace: Trace | null) => void;
}

export const useTraceStore = create<TraceState>()((set) => ({
  path: [],
  focus: null,
  pendingReveal: null,
  setPath: (path, reveal) => {
    set({ path, pendingReveal: reveal });
  },
  clearReveal: (reveal) => {
    set((state) =>
      state.pendingReveal === reveal ? { pendingReveal: null } : state,
    );
  },
  focusOutput: (trace, chunk) => {
    const navigation = navigateToOutput(trace, chunk);

    set({
      path: navigation.path,
      focus: navigation.focus,
      pendingReveal: { block: navigation.focus.block, focusLine: true },
    });
  },
  resetForTrace: (trace) => {
    const navigation = trace === null ? null : navigateToException(trace);

    set({
      path: navigation?.path ?? (trace === null ? [] : initialPath(trace)),
      focus: navigation?.focus ?? null,
      // A run never pans the canvas: an exception opens and focuses its path,
      // but the editor the user has to go back to stays where it is. Only an
      // explicit click (output, site, sibling) asks for a reveal.
      pendingReveal: null,
    });
  },
}));
