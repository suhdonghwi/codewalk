import { CanvasWindow } from "@/domain/canvas/index.ts";
import { cn } from "@/ui/utils.ts";

import { outputSegments } from "./output-segments.ts";
import { useRunStore } from "./store.ts";

interface OutputWindowProps {
  focusedChunk: number | null;
  onSelectChunk: (chunk: number) => void;
}

export function OutputWindow({
  focusedChunk,
  onSelectChunk,
}: OutputWindowProps) {
  const outcome = useRunStore((state) => state.outcome);
  const segments = outputSegments(outcome);

  return (
    <CanvasWindow className="w-80" id="output" title="output">
      <pre className="code-surface m-0 block max-h-120 w-full overflow-auto rounded-none border-0 px-2 py-2 whitespace-pre outline-none">
        {segments.map((segment) => {
          if (segment.kind === "notice") {
            return (
              <span className="text-code-error" key="notice">
                {segment.text}
              </span>
            );
          }

          const focused = focusedChunk === segment.chunk;

          const open = (): void => {
            onSelectChunk(segment.chunk);
          };

          // A span, not a <button>: browsers lay buttons out as boxes, which
          // would stop the newlines inside the output from breaking lines.
          return (
            <span
              className={cn(
                "cursor-pointer hover:bg-neutral-100 focus-visible:outline focus-visible:outline-site-accent focus-visible:outline-offset-1",
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
