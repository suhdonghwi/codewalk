import type { End, Header, LocId, NodeId } from "./schema.ts";

export interface TraceNode {
  id: NodeId;
  loc: LocId;
  parent: NodeId | null;
  children: NodeId[];
  outputs: number[];
  exc: string | null;
  /** Whether any output chunk lies in this node's subtree. */
  hasOutput: boolean;
}

export interface OutputChunk {
  node: NodeId;
  stream: "stdout" | "stderr";
  text: string;
}

export interface Trace {
  header: Header;
  nodes: TraceNode[];
  outputs: OutputChunk[];
  root: NodeId | null;
  end: End;
}

export type TraceParseError = {
  kind: "empty" | "json" | "schema" | "structure";
  line: number;
  message: string;
};

export type ParseResult =
  { ok: true; trace: Trace } | { ok: false; error: TraceParseError };
