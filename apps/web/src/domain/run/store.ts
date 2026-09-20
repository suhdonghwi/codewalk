import { create } from "zustand";

import { readStoredState, writeStoredState } from "./persistence.ts";

import type { RunOutcome } from "./types.ts";

interface RunState {
  source: string;
  stdin: string;
  outcome: RunOutcome | null;
  running: boolean;
  setSource: (source: string) => void;
  setStdin: (stdin: string) => void;
  setRunning: (running: boolean) => void;
  setOutcome: (outcome: RunOutcome) => void;
}

const initialInput = readStoredState(window.localStorage);

export const useRunStore = create<RunState>()((set, get) => ({
  source: initialInput.source,
  stdin: initialInput.stdin,
  outcome: null,
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
  setRunning: (running) => {
    set({ running });
  },
  setOutcome: (outcome) => {
    set({ outcome });
  },
}));
