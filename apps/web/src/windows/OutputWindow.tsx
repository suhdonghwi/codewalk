import { outputSegments } from "@/run/output-segments.ts";
import { useAppStore } from "@/state/store.ts";

import { CanvasWindow } from "../canvas/Window.tsx";

export function OutputWindow() {
  const outcome = useAppStore((state) => state.outcome);
  const segments = outputSegments(outcome);

  return (
    <CanvasWindow className="output-window" id="output" title="output">
      <pre>
        {segments.map((segment) => (
          <span
            className={segment.kind === "stdout" ? undefined : "output-error"}
            key={segment.kind === "notice" ? "notice" : segment.chunk}
          >
            {segment.text}
          </span>
        ))}
      </pre>
    </CanvasWindow>
  );
}
