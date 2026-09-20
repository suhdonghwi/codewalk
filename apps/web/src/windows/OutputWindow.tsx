import { outputSegments } from "@/run/output-segments.ts";
import { cn } from "@/lib/utils.ts";
import { useAppStore } from "@/state/store.ts";

import { CanvasWindow } from "../canvas/Window.tsx";

export function OutputWindow() {
  const outcome = useAppStore((state) => state.outcome);
  const focus = useAppStore((state) => state.focus);
  const segments = outputSegments(outcome);

  return (
    <CanvasWindow className="w-[320px]" id="output" title="output">
      <pre className="m-0 block max-h-[480px] w-full overflow-auto rounded-none border-0 bg-white px-[9px] py-[7px] font-code text-code text-code-foreground whitespace-pre outline-none">
        {segments.map((segment) => {
          if (segment.kind === "notice") {
            return (
              <span className="text-code-error" key="notice">
                {segment.text}
              </span>
            );
          }

          const focused =
            focus?.kind === "output" && focus.chunk === segment.chunk;

          const open = (): void => {
            useAppStore.getState().focusOutput(segment.chunk);
          };

          // A span, not a <button>: browsers lay buttons out as boxes, which
          // would stop the newlines inside the output from breaking lines.
          return (
            <span
              className={cn(
                "cursor-pointer hover:bg-neutral-100 focus-visible:[outline:1px_solid_var(--color-site-accent)] focus-visible:outline-offset-1",
                segment.kind === "stderr" && "text-code-error",
                focused && "bg-site-accent/12",
              )}
              data-output-chunk={segment.chunk}
              key={segment.chunk}
              onClick={open}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                open();
              }}
              role="button"
              tabIndex={0}
            >
              {segment.text}
            </span>
          );
        })}
      </pre>
    </CanvasWindow>
  );
}
