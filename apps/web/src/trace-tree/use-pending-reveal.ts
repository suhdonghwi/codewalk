import { useLayoutEffect } from "react";

import { revealRect, revealWidth } from "@/canvas/view.ts";
import { useAppStore } from "@/state/store.ts";

import type { RefObject } from "react";
import type { ColumnLayout } from "./layout.ts";
import type { Measurement } from "./measured-trace-window.tsx";
import type { Path } from "./path.ts";

const REVEAL_MARGIN = 48;

const MIN_REVEAL_WIDTH = 240;

const REVEAL_HEIGHT = 120;

export function usePendingReveal(
  treeRef: RefObject<HTMLDivElement | null>,
  path: Path,
  layouts: ColumnLayout[],
  measurements: (Measurement | null)[],
): void {
  const pending = useAppStore((state) => state.pendingReveal);

  useLayoutEffect(() => {
    if (pending === null) return;
    const column = path.indexOf(pending.block);

    if (column === -1) {
      useAppStore.getState().clearReveal(pending);

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

    const state = useAppStore.getState();

    const focusOffset = pending.focusLine
      ? (measurement.focusCenterY ?? 0) - REVEAL_HEIGHT / 2
      : 0;

    const view = revealRect(
      state.view,
      { width: canvas.clientWidth, height: canvas.clientHeight },
      {
        x: state.windows.trace.x + layout.x,
        y: state.windows.trace.y + layout.expandedTop + focusOffset,
        width: revealWidth(
          measurement.width,
          canvas.clientWidth,
          state.view.scale,
          REVEAL_MARGIN,
          MIN_REVEAL_WIDTH,
        ),
        height: REVEAL_HEIGHT,
      },
      REVEAL_MARGIN,
    );

    state.clearReveal(pending);

    if (view !== state.view) state.setView(view);
  }, [layouts, measurements, path, pending, treeRef]);
}
