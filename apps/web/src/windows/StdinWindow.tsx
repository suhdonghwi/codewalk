import type { ChangeEvent } from "react";

import { CanvasWindow } from "@/canvas/Window.tsx";
import { useAppStore } from "@/state/store.ts";

export function StdinWindow() {
  const stdin = useAppStore((state) => state.stdin);

  function updateStdin(event: ChangeEvent<HTMLTextAreaElement>): void {
    useAppStore.getState().setStdin(event.currentTarget.value);
  }

  return (
    <CanvasWindow className="w-[320px]" id="stdin" title="stdin">
      <textarea
        aria-label="stdin"
        className="m-0 block h-[131px] w-full resize-none overflow-auto rounded-none border-0 bg-white px-[9px] py-[7px] font-code text-code text-code-foreground whitespace-pre outline-none"
        onChange={updateStdin}
        spellCheck={false}
        value={stdin}
      />
    </CanvasWindow>
  );
}
