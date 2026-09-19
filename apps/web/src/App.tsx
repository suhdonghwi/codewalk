import { useCallback, useEffect, useMemo } from "react";

import { Canvas } from "@/canvas/Canvas.tsx";
import { TooltipProvider } from "@/components/ui/tooltip.tsx";
import { createFixtureRunner, createHttpRunner } from "@/run/runners.ts";
import type { TraceRunner } from "@/run/types.ts";
import { useAppStore } from "@/state/store.ts";
import { RootTraceWindow } from "@/trace-view/TraceWindow.tsx";
import { EditorWindow } from "@/windows/EditorWindow.tsx";
import { OutputWindow } from "@/windows/OutputWindow.tsx";
import { StdinWindow } from "@/windows/StdinWindow.tsx";

interface AppProps {
  runner?: TraceRunner;
}

function requestedFixtureBlock(): number | null {
  if (import.meta.env.VITE_RUNNER !== "fixture") return null;
  const value = new URLSearchParams(window.location.search).get("block");

  if (value === null || !/^\d+$/.test(value)) return null;

  return Number(value);
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

  let traceWindow = null;

  if (outcome?.kind === "trace" && outcome.trace.root !== null) {
    const requested = requestedFixtureBlock();

    const requestedNode =
      requested === null ? undefined : outcome.trace.nodes[requested];

    const requestedLoc =
      requestedNode === undefined
        ? undefined
        : outcome.trace.header.locs[requestedNode.loc];

    const block =
      requested !== null && requestedLoc?.role === "block"
        ? requested
        : outcome.trace.root;

    traceWindow = <RootTraceWindow block={block} trace={outcome.trace} />;
  }

  return (
    <TooltipProvider>
      <Canvas>
        <EditorWindow onRun={run} shortcut={runShortcut()} />
        <StdinWindow />
        <OutputWindow />
        {traceWindow}
      </Canvas>
    </TooltipProvider>
  );
}
