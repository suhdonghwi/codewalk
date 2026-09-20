import { useLayoutEffect } from "react";

import {
  revealRect,
  revealWidth,
  useCanvasStore,
} from "@/domain/canvas/index.ts";

import type { RefObject } from "react";
import type { ColumnLayout } from "./layout.ts";
import type { Measurement } from "./measured-trace-window.tsx";
import type { Path } from "./path.ts";
import { useTraceStore } from "../store.ts";

const REVEAL_MARGIN = 48;

const MIN_REVEAL_WIDTH = 240;

const REVEAL_HEIGHT = 120;

export function usePendingReveal(
  treeRef: RefObject<HTMLDivElement | null>,
  path: Path,
  layouts: ColumnLayout[],
  measurements: (Measurement | null)[],
): void {
  const pending = useTraceStore((state) => state.pendingReveal);

  useLayoutEffect(() => {
    if (pending === null) return;
    const column = path.indexOf(pending.block);

    if (column === -1) {
      useTraceStore.getState().clearReveal(pending);

      return;
    }

    const layout = layouts[column];
    const measurement = measurements[column];
    const canvas = treeRef.current?.closest<HTMLElement>("[data-canvas]");

    if (
      layout === undefined ||
      measurement === undefined ||
      measurement === null ||
      canvas === undefined ||
      canvas === null ||
      (pending.focusLine && measurement.focusCenterY === null)
    ) {
      return;
    }

    const canvasState = useCanvasStore.getState();

    const focusOffset = pending.focusLine
      ? (measurement.focusCenterY ?? 0) - REVEAL_HEIGHT / 2
      : 0;

    const x = pending.focusLine ? layout.windowX : layout.x;
    const width = layout.windowX - x + measurement.width;

    const view = revealRect(
      canvasState.view,
      { width: canvas.clientWidth, height: canvas.clientHeight },
      {
        x: canvasState.windows.trace.x + x,
        y: canvasState.windows.trace.y + layout.top + focusOffset,
        width: revealWidth(
          width,
          canvas.clientWidth,
          canvasState.view.scale,
          REVEAL_MARGIN,
          MIN_REVEAL_WIDTH,
        ),
        height: REVEAL_HEIGHT,
      },
      REVEAL_MARGIN,
    );

    useTraceStore.getState().clearReveal(pending);

    if (view !== canvasState.view) canvasState.setView(view);
  }, [layouts, measurements, path, pending, treeRef]);
}
