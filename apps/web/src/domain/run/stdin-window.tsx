import type { ChangeEvent } from "react";

import { CanvasWindow } from "@/domain/canvas/index.ts";

import { useRunStore } from "./store.ts";

const MINIMUM_SIZE = { width: 200, height: 96 };

export function StdinWindow() {
  const stdin = useRunStore((state) => state.stdin);

  function updateStdin(event: ChangeEvent<HTMLTextAreaElement>): void {
    useRunStore.getState().setStdin(event.currentTarget.value);
  }

  return (
    <CanvasWindow id="stdin" minimumSize={MINIMUM_SIZE} title="stdin">
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
