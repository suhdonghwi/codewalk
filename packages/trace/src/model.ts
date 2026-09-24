import type {
  End,
  Header,
  HeapObject,
  Loc,
  LocId,
  NodeId,
  Value,
} from "./schema.ts";

export type TraceLoc = Loc & {
  id: LocId;
  owner: LocId | null;
};

export interface Site {
  loc: TraceLoc;
  blocks: TraceNode[];
  outputs: number[];
}

export interface TraceNode {
  id: NodeId;
  loc: TraceLoc;
  parent: TraceNode | null;
  children: TraceNode[];
  sites: Site[];
  outputs: number[];
  values: ValueChunk[];
  returned: RecordedValue | null;
  exc: string | null;
}

export interface OutputChunk {
  node: TraceNode;
  stream: "stdout" | "stderr";
  text: string;
}

export interface RecordedValue {
  value: Value;
  at: number;
  literal: boolean;
}

export interface ValueChunk extends RecordedValue {
  loc: TraceLoc | null;
  name: string;
}

export interface ObjectVersion {
  at: number;
  object: HeapObject;
}

export interface Trace {
  source: Header["source"];
  literals: Header["literals"];
  locs: TraceLoc[];
  nodes: TraceNode[];
  outputs: OutputChunk[];
  objects: ObjectVersion[][];
  end: End;
}

export interface TraceParseError {
  line: number;
  message: string;
}

export type ParseResult =
  { ok: true; trace: Trace } | { ok: false; error: TraceParseError };
