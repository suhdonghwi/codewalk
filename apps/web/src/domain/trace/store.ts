import type { Trace } from "@codewalk/trace";
import { create } from "zustand";

import type { ResizeAxes, Size } from "@/domain/canvas/index.ts";

import { exceptionPath, outputPath } from "./tree/navigation.ts";
import { initialPath, type Path } from "./tree/path.ts";

export type ColumnPart = "window" | "siblings";

export interface PartSize {
  width: number | null;
  height: number | null;
}

type ColumnSizes = Record<number, Partial<Record<ColumnPart, PartSize>>>;

const AUTOMATIC: PartSize = { width: null, height: null };

interface TraceState {
  path: Path;
  columnSizes: ColumnSizes;
  setPath: (path: Path) => void;
  resizeColumn: (
    column: number,
    part: ColumnPart,
    axes: ResizeAxes,
    size: Size | null,
  ) => void;
  openOutput: (trace: Trace, chunk: number) => void;
  resetForTrace: (trace: Trace | null) => void;
}

export function partSize(
  sizes: ColumnSizes,
  column: number,
  part: ColumnPart,
): PartSize {
  return sizes[column]?.[part] ?? AUTOMATIC;
}

export const useTraceStore = create<TraceState>()((set) => ({
  path: [],
  columnSizes: {},
  setPath: (path) => {
    set({ path });
  },
  resizeColumn: (column, part, axes, size) => {
    set((state) => {
      const current = partSize(state.columnSizes, column, part);

      return {
        columnSizes: {
          ...state.columnSizes,
          [column]: {
            ...state.columnSizes[column],
            [part]: {
              width: axes.x ? (size?.width ?? null) : current.width,
              height: axes.y ? (size?.height ?? null) : current.height,
            },
          },
        },
      };
    });
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
