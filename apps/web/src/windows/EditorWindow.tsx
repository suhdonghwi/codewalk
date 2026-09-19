import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LoaderCircle, Play } from "lucide-react";
import { useEffect, useRef } from "react";

import { CanvasWindow } from "@/canvas/Window.tsx";
import { editorExtensions } from "@/code/extensions.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { useAppStore } from "@/state/store.ts";

interface EditorWindowProps {
  onRun: () => void;
  shortcut: string;
}

export function EditorWindow({ onRun, shortcut }: EditorWindowProps) {
  const editorHost = useRef<HTMLDivElement>(null);
  const running = useAppStore((state) => state.running);

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

    return () => {
      view.destroy();
    };
  }, []);

  const runButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label="Run"
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
      className="editor-window"
      id="editor"
      title="main.py"
      titleAction={runButton}
    >
      <div className="editor-host" ref={editorHost} />
    </CanvasWindow>
  );
}
