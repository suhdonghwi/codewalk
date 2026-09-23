import type {
  End,
  Header,
  HeapObject,
  LocId,
  NodeId,
  Value,
} from "./schema.ts";

export interface TraceNode {
  id: NodeId;
  loc: LocId;
  parent: NodeId | null;
  children: NodeId[];
  outputs: number[];
  values: ValueChunk[];
  returned: RecordedValue | null;
  exc: string | null;
}

export interface OutputChunk {
  node: NodeId;
  stream: "stdout" | "stderr";
  text: string;
}

export interface RecordedValue {
  value: Value;
  at: number;
  literal: boolean;
}

export interface ValueChunk extends RecordedValue {
  loc: LocId | null;
  name: string;
}

export interface ObjectVersion {
  at: number;
  object: HeapObject;
}

export interface Trace {
  header: Header;
  nodes: TraceNode[];
  outputs: OutputChunk[];
  objects: ObjectVersion[][];
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
