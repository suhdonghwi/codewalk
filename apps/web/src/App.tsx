import { useCallback, useEffect, useMemo } from "react";

import { Canvas } from "@/canvas/Canvas.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import { createFixtureRunner, createHttpRunner } from "@/run/runners.ts";
import type { TraceRunner } from "@/run/types.ts";
import { useAppStore } from "@/state/store.ts";
import { TraceTree } from "@/trace-tree/TraceTree.tsx";
import { EditorWindow } from "@/windows/EditorWindow.tsx";
import { OutputWindow } from "@/windows/OutputWindow.tsx";
import { StdinWindow } from "@/windows/StdinWindow.tsx";

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

export function App({ runner: injectedRunner }: AppProps) {
  const runner = useMemo(
    () => injectedRunner ?? defaultRunner(),
    [injectedRunner],
  );

  const outcome = useAppStore((state) => state.outcome);

  const run = useCallback(() => {
    const state = useAppStore.getState();

    if (state.running) return;

    useAppStore.setState({ running: true, outcome: null });
    void runner
      .run({ source: state.source, stdin: state.stdin })
      .then((outcome) => {
        useAppStore.getState().setOutcome(outcome);
      })
      .catch(() => {
        useAppStore.getState().setOutcome({
          kind: "unreachable",
          message: "Runner failed",
        });
      })
      .finally(() => {
        useAppStore.getState().setRunning(false);
      });
  }, [runner]);

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
        <OutputWindow />
        {traceTree}
      </Canvas>
    </TooltipProvider>
  );
}
