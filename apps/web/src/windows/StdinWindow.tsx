import type { ChangeEvent } from "react";

import { CanvasWindow } from "@/canvas/Window.tsx";
import { useAppStore } from "@/state/store.ts";

export function StdinWindow() {
  const stdin = useAppStore((state) => state.stdin);

  function updateStdin(event: ChangeEvent<HTMLTextAreaElement>): void {
    useAppStore.getState().setStdin(event.currentTarget.value);
  }

  return (
    <CanvasWindow className="stdin-window" id="stdin" title="stdin">
      <textarea
        aria-label="stdin"
        onChange={updateStdin}
        spellCheck={false}
        value={stdin}
      />
    </CanvasWindow>
  );
}
