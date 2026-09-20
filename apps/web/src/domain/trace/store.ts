import type { NodeId, Trace } from "@codewalk/trace";
import { create } from "zustand";

import { navigateToException, navigateToOutput } from "./tree/navigation.ts";
import { initialPath, type Path } from "./tree/path.ts";

interface PendingReveal {
  block: NodeId;
  line: number | null;
}

interface TraceState {
  path: Path;
  pendingReveal: PendingReveal | null;
  setPath: (path: Path, reveal: PendingReveal | null) => void;
  clearReveal: (reveal: PendingReveal) => void;
  openOutput: (trace: Trace, chunk: number) => void;
  resetForTrace: (trace: Trace | null) => void;
}

export const useTraceStore = create<TraceState>()((set) => ({
  path: [],
  pendingReveal: null,
  setPath: (path, reveal) => {
    set({ path, pendingReveal: reveal });
  },
  clearReveal: (reveal) => {
    set((state) =>
      state.pendingReveal === reveal ? { pendingReveal: null } : state,
    );
  },
  openOutput: (trace, chunk) => {
    const navigation = navigateToOutput(trace, chunk);

    set({
      path: navigation.path,
      pendingReveal: { block: navigation.block, line: navigation.line },
    });
  },
  resetForTrace: (trace) => {
    const navigation = trace === null ? null : navigateToException(trace);

    set({
      path: navigation?.path ?? (trace === null ? [] : initialPath(trace)),
      // A run never pans the canvas: an exception opens its path,
      // but the editor the user has to go back to stays where it is. Only an
      // explicit click (output, site, sibling) asks for a reveal.
      pendingReveal: null,
    });
  },
}));
