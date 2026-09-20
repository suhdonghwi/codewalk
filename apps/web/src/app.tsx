import { useEffect } from "react";

import { Canvas } from "@/domain/canvas/index.ts";
import { EditorWindow } from "@/domain/editor/index.ts";
import {
  createFixtureRunner,
  createHttpRunner,
  OutputWindow,
  StdinWindow,
  useRunStore,
} from "@/domain/run/index.ts";
import { TraceTree, useTraceStore } from "@/domain/trace/index.ts";
import { TooltipProvider } from "@/ui/tooltip.tsx";

import type { RunOutcome, TraceRunner } from "@/domain/run/index.ts";

interface AppProps {
  runner?: TraceRunner;
}

function defaultRunner(): TraceRunner {
  return import.meta.env.VITE_RUNNER === "fixture"
    ? createFixtureRunner()
    : createHttpRunner();
}

function runShortcut(): string {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘↵" : "Ctrl↵";
}

function finishRun(outcome: RunOutcome): void {
  useRunStore.getState().setOutcome(outcome);
  useTraceStore
    .getState()
    .resetForTrace(outcome.kind === "trace" ? outcome.trace : null);
}

export function App({ runner: injectedRunner }: AppProps) {
  const runner = injectedRunner ?? defaultRunner();

  const outcome = useRunStore((state) => state.outcome);

  function run(): void {
    const state = useRunStore.getState();

    if (state.running) return;

    // The previous result stays on screen until the new one replaces it, so the
    // output window and the trace tree do not collapse and re-expand.
    useRunStore.getState().setRunning(true);
    void runner
      .run({ source: state.source, stdin: state.stdin })
      .then(finishRun)
      .catch(() => {
        finishRun({
          kind: "unreachable",
          message: "Runner failed",
        });
      })
      .finally(() => {
        useRunStore.getState().setRunning(false);
      });
  }

  function selectOutputChunk(chunk: number): void {
    const current = useRunStore.getState().outcome;

    if (current?.kind !== "trace") return;
    useTraceStore.getState().openOutput(current.trace, chunk);
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
    outcome?.kind === "trace" ? <TraceTree trace={outcome.trace} /> : null;

  return (
    <TooltipProvider>
      <Canvas>
        <EditorWindow onRun={run} shortcut={runShortcut()} />
        <StdinWindow />
        <OutputWindow onSelectChunk={selectOutputChunk} />
        {traceTree}
      </Canvas>
    </TooltipProvider>
  );
}
