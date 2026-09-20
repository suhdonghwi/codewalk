import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LoaderCircle, Play } from "lucide-react";
import { useEffect, useRef } from "react";

import { useWindowResize } from "@/canvas/use-window-resize.ts";
import { CanvasWindow } from "@/canvas/window.tsx";
import { editorExtensions } from "@/code/extensions.ts";
import { setSyntaxError } from "@/code/syntax-error.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { useAppStore } from "@/state/store.ts";

const MINIMUM_SIZE = { width: 320, height: 160 };

const RESIZE_HANDLE = "absolute z-[4] touch-none";

interface EditorWindowProps {
  onRun: () => void;
  shortcut: string;
}

export function EditorWindow({ onRun, shortcut }: EditorWindowProps) {
  const editorHost = useRef<HTMLDivElement>(null);
  const running = useAppStore((state) => state.running);
  const size = useAppStore((state) => state.editorSize);

  const currentSize = () => useAppStore.getState().editorSize;
  const resize = useAppStore.getState().resizeEditor;

  const resizeRight = useWindowResize(
    { x: true, y: false },
    MINIMUM_SIZE,
    currentSize,
    resize,
  );

  const resizeBottom = useWindowResize(
    { x: false, y: true },
    MINIMUM_SIZE,
    currentSize,
    resize,
  );

  const resizeCorner = useWindowResize(
    { x: true, y: true },
    MINIMUM_SIZE,
    currentSize,
    resize,
  );

  useEffect(() => {
    const parent = editorHost.current;

    if (parent === null) return;

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: useAppStore.getState().source,
        extensions: editorExtensions((source) => {
          useAppStore.getState().setSource(source);
        }),
      }),
    });

    const unsubscribe = useAppStore.subscribe((state, previous) => {
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
          className="size-5 rounded-[5px]"
          data-window-control
          disabled={running}
          onClick={onRun}
          size="icon"
          variant="ghost"
        >
          {running ? (
            <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
          ) : (
            <Play aria-hidden className="size-3.5" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{`Run  ${shortcut}`}</TooltipContent>
    </Tooltip>
  );

  return (
    <CanvasWindow
      className="flex flex-col"
      id="editor"
      style={{ width: size.width, height: size.height }}
      title="main.py"
      titleAction={runButton}
    >
      <div className="min-h-0 flex-1" ref={editorHost} />
      <div
        className={`${RESIZE_HANDLE} top-7 right-0 bottom-3 w-1.5 cursor-ew-resize`}
        {...resizeRight}
      />
      <div
        className={`${RESIZE_HANDLE} right-3 bottom-0 left-0 h-1.5 cursor-ns-resize`}
        {...resizeBottom}
      />
      <div
        className={`${RESIZE_HANDLE} right-0 bottom-0 size-3 cursor-nwse-resize`}
        {...resizeCorner}
      />
    </CanvasWindow>
  );
}
