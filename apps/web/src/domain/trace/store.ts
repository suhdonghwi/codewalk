import type { Trace } from "@codewalk/trace";
import { create } from "zustand";

import { exceptionPath, outputPath } from "./tree/navigation.ts";
import { initialPath, type Path } from "./tree/path.ts";

interface TraceState {
  path: Path;
  setPath: (path: Path) => void;
  openOutput: (trace: Trace, chunk: number) => void;
  resetForTrace: (trace: Trace | null) => void;
}

export const useTraceStore = create<TraceState>()((set) => ({
  path: [],
  setPath: (path) => {
    set({ path });
  },
  openOutput: (trace, chunk) => {
    set({ path: outputPath(trace, chunk) });
  },
  resetForTrace: (trace) => {
    set({
      path: trace === null ? [] : (exceptionPath(trace) ?? initialPath(trace)),
    });
  },
}));
