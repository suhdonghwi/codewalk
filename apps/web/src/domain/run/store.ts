import { create } from "zustand";

import { readStoredState, writeStoredState } from "./persistence.ts";

import type { StoredState } from "./persistence.ts";
import type { RunOutcome } from "./types.ts";
import type { NodeId } from "@codewalk/trace";

interface RunState {
  source: string;
  stdin: string;
  outcome: RunOutcome | null;
  path: NodeId[];
  running: boolean;
  setSource: (source: string) => void;
  setStdin: (stdin: string) => void;
  setInput: (input: StoredState) => void;
  setRunning: (running: boolean) => void;
  setOutcome: (outcome: RunOutcome, path: NodeId[]) => void;
  setPath: (path: NodeId[]) => void;
}

const initialInput = readStoredState(window.localStorage);

export const useRunStore = create<RunState>()((set, get) => ({
  source: initialInput.source,
  stdin: initialInput.stdin,
  outcome: null,
  path: [],
  running: false,
  setSource: (source) => {
    const stdin = get().stdin;
    writeStoredState(window.localStorage, { source, stdin });
    set({ source });
  },
  setStdin: (stdin) => {
    const source = get().source;
    writeStoredState(window.localStorage, { source, stdin });
    set({ stdin });
  },
  setInput: (input) => {
    writeStoredState(window.localStorage, input);
    set({ source: input.source, stdin: input.stdin });
  },
  setRunning: (running) => {
    set({ running });
  },
  setOutcome: (outcome, path) => {
    set({ outcome, path });
  },
  setPath: (path) => {
    set({ path });
  },
}));
