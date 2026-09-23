import type { ChangeEvent } from "react";

import { CanvasWindow } from "@/domain/canvas/index.ts";

import { useRunStore } from "./store.ts";

export function StdinWindow() {
  const stdin = useRunStore((state) => state.stdin);

  function updateStdin(event: ChangeEvent<HTMLTextAreaElement>): void {
    useRunStore.getState().setStdin(event.currentTarget.value);
  }

  return (
    <CanvasWindow id="stdin" className="h-[158px] w-80" title="stdin">
      <textarea
        aria-label="stdin"
        className="code-surface m-0 block min-h-0 w-full flex-1 resize-none overflow-auto rounded-none border-0 px-2 py-2 whitespace-pre outline-none"
        onChange={updateStdin}
        spellCheck={false}
        value={stdin}
      />
    </CanvasWindow>
  );
}
