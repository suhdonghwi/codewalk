import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LoaderCircle, Play } from "lucide-react";
import { useEffect, useRef } from "react";

import { CanvasWindow } from "@/domain/canvas/index.ts";
import { useRunStore } from "@/domain/run/index.ts";
import { Button } from "@/ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip.tsx";

import { editorExtensions } from "./extensions.ts";
import { setSyntaxError } from "./syntax-error.ts";

const MINIMUM_SIZE = { width: 320, height: 160 };

interface EditorWindowProps {
  onRun: () => void;
  shortcut: string;
}

export function EditorWindow({ onRun, shortcut }: EditorWindowProps) {
  const editorHost = useRef<HTMLDivElement>(null);
  const running = useRunStore((state) => state.running);

  useEffect(() => {
    const parent = editorHost.current;

    if (parent === null) return;

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: useRunStore.getState().source,
        extensions: editorExtensions((source) => {
          useRunStore.getState().setSource(source);
        }),
      }),
    });

    const unsubscribe = useRunStore.subscribe((state, previous) => {
      if (state.outcome === previous.outcome) return;

      const end =
        state.outcome?.kind === "trace" ? state.outcome.trace.end : null;

      view.dispatch({
        effects: setSyntaxError.of(
          end?.status === "syntax_error"
            ? { from: end.start, to: end.end }
            : null,
        ),
      });
    });

    return () => {
      unsubscribe();
      view.destroy();
    };
  }, []);

  const runButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label="Run"
          className="size-5 rounded-sm text-run hover:text-run disabled:pointer-events-auto"
          data-window-control
          disabled={running}
          onClick={onRun}
          size="icon"
          variant="ghost"
        >
          {running ? (
            <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
          ) : (
            <Play aria-hidden className="size-3.5 fill-current" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{`Run  ${shortcut}`}</TooltipContent>
    </Tooltip>
  );

  return (
    <CanvasWindow
      id="editor"
      minimumSize={MINIMUM_SIZE}
      title="main.py"
      titleAction={runButton}
    >
      <div className="min-h-0 flex-1" ref={editorHost} />
    </CanvasWindow>
  );
}
