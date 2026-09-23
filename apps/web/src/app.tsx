import { useEffect } from "react";

import { Canvas } from "@/domain/canvas/index.ts";
import { EditorWindow } from "@/domain/editor/index.ts";
import {
  OutputWindow,
  runTrace,
  StdinWindow,
  useRunStore,
} from "@/domain/run/index.ts";
import { openingPath, outputPath, TraceTree } from "@/domain/trace/index.ts";
import { TooltipProvider } from "@/ui/tooltip.tsx";

import type { Example, RunOutcome } from "@/domain/run/index.ts";

function runShortcut(): string {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘↵" : "Ctrl↵";
}

function finishRun(outcome: RunOutcome): void {
  useRunStore
    .getState()
    .setOutcome(
      outcome,
      outcome.kind === "trace" ? openingPath(outcome.trace) : [],
    );
}

export function App() {
  const outcome = useRunStore((state) => state.outcome);
  const path = useRunStore((state) => state.path);

  function run(): void {
    const state = useRunStore.getState();

    if (state.running) return;

    // The previous result stays on screen until the new one replaces it, so the
    // output window and the trace tree do not collapse and re-expand.
    useRunStore.getState().setRunning(true);
    void runTrace({ source: state.source, stdin: state.stdin })
      .then(finishRun)
      .finally(() => {
        useRunStore.getState().setRunning(false);
      });
  }

  function openExample(example: Example): void {
    useRunStore.getState().setInput(example);
    run();
  }

  function selectOutputChunk(chunk: number): void {
    const current = useRunStore.getState().outcome;

    if (current?.kind !== "trace") return;
    useRunStore.getState().setPath(outputPath(current.trace, chunk));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      run();
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [run]);

  const traceTree =
    outcome?.kind === "trace" ? (
      <TraceTree
        onNavigate={(next) => {
          useRunStore.getState().setPath(next);
        }}
        path={path}
        trace={outcome.trace}
      />
    ) : null;

  return (
    <TooltipProvider delay={300}>
      <Canvas>
        <EditorWindow
          onOpenExample={openExample}
          onRun={run}
          shortcut={runShortcut()}
        />
        <StdinWindow />
        <OutputWindow onSelectChunk={selectOutputChunk} />
        {traceTree}
      </Canvas>
    </TooltipProvider>
  );
}
