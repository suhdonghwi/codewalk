import type { ChangeEvent } from "react";

import { CanvasWindow } from "@/domain/canvas/index.ts";

import { useRunStore } from "./store.ts";

export function StdinWindow() {
  const stdin = useRunStore((state) => state.stdin);

  function updateStdin(event: ChangeEvent<HTMLTextAreaElement>): void {
    useRunStore.getState().setStdin(event.currentTarget.value);
  }

  return (
    <CanvasWindow className="w-80" id="stdin" title="stdin">
      <textarea
        aria-label="stdin"
        className="code-surface m-0 block h-32 w-full resize-none overflow-auto rounded-none border-0 px-2 py-2 whitespace-pre outline-none"
        onChange={updateStdin}
        spellCheck={false}
        value={stdin}
      />
    </CanvasWindow>
  );
}
