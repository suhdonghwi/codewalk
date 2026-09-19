import { outputSegments } from "@/run/output-segments.ts";
import { useAppStore } from "@/state/store.ts";

import { CanvasWindow } from "../canvas/Window.tsx";

export function OutputWindow() {
  const outcome = useAppStore((state) => state.outcome);
  const focus = useAppStore((state) => state.focus);
  const segments = outputSegments(outcome);

  return (
    <CanvasWindow className="output-window" id="output" title="output">
      <pre>
        {segments.map((segment) => {
          if (segment.kind === "notice") {
            return (
              <span className="output-error" key="notice">
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
              className={`output-segment${segment.kind === "stderr" ? " output-error" : ""}${focused ? " output-segment-focused" : ""}`}
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
