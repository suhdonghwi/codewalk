import type { ColumnLayout } from "./layout.ts";
import type { NodeId } from "@codewalk/trace";

interface TreeEdgesProps {
  layouts: ColumnLayout[];
  path: NodeId[];
}

export function TreeEdges({ layouts, path }: TreeEdgesProps) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute z-0 size-px overflow-visible"
    >
      {layouts.map(({ edge }, column) =>
        edge === null ? null : (
          <path
            className="animate-tree-fade-in fill-none stroke-site-accent/60 stroke-[1.5]"
            d={`M ${edge.fromX} ${edge.y} H ${edge.toX}`}
            key={`${column}:${path[column]}`}
          />
        ),
      )}
    </svg>
  );
}
