import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LoaderCircle, Play } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import { CanvasWindow } from "@/domain/canvas/index.ts";
import { type Example, useRunStore } from "@/domain/run/index.ts";
import { Button } from "@/ui/button.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/tooltip.tsx";

import { ExampleMenu } from "./example-menu.tsx";
import { editorExtensions } from "./extensions.ts";
import { setSyntaxError } from "./syntax-error.ts";

interface EditorWindowProps {
  onRun: () => void;
  onOpenExample: (example: Example) => void;
  shortcut: string;
}

export function EditorWindow({
  onRun,
  onOpenExample,
  shortcut,
}: EditorWindowProps) {
  const editorHost = useRef<HTMLDivElement>(null);
  const running = useRunStore((state) => state.running);

  useLayoutEffect(() => {
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
      if (
        state.source !== previous.source &&
        state.source !== view.state.doc.toString()
      ) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: state.source },
        });
      }

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
      <TooltipTrigger
        render={
          <Button
            className="h-5 cursor-pointer rounded-sm text-run hover:text-run disabled:pointer-events-auto"
            data-window-control
            disabled={running}
            onClick={onRun}
            size="xs"
            variant="ghost"
          />
        }
      >
        {running ? (
          <LoaderCircle
            aria-hidden
            className="size-3.5 animate-spin"
            data-icon="inline-start"
          />
        ) : (
          <Play
            aria-hidden
            className="size-3.5 fill-current"
            data-icon="inline-start"
          />
        )}
        Run
      </TooltipTrigger>
      <TooltipContent>{`Run  ${shortcut}`}</TooltipContent>
    </Tooltip>
  );

  return (
    <CanvasWindow
      className="w-112"
      id="editor"
      title="main.py"
      titleAction={
        <span className="inline-flex items-center gap-0.5">
          <ExampleMenu onOpenExample={onOpenExample} />
          {runButton}
        </span>
      }
    >
      <div ref={editorHost} />
    </CanvasWindow>
  );
}
