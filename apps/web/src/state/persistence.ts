import { z } from "zod";

const DEFAULT_SOURCE = `def fact(n):
    print("fact", n)
    if n <= 1:
        return 1
    return n * fact(n - 1)

for i in range(2):
    print(fact(i + 1))
`;

const STORAGE_KEY = "codewalk.web.input.v1";

const StoredStateSchema = z
  .object({
    source: z.string(),
    stdin: z.string(),
  })
  .strict();

export interface StoredState {
  source: string;
  stdin: string;
}

const DEFAULT_STORED_STATE: StoredState = {
  source: DEFAULT_SOURCE,
  stdin: "",
};

export function parseStoredState(value: string | null): StoredState {
  if (value === null) return DEFAULT_STORED_STATE;

  try {
    const result = StoredStateSchema.safeParse(JSON.parse(value));

    return result.success ? result.data : DEFAULT_STORED_STATE;
  } catch {
    return DEFAULT_STORED_STATE;
  }
}

export function readStoredState(storage: Storage): StoredState {
  try {
    return parseStoredState(storage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_STORED_STATE;
  }
}

export function writeStoredState(storage: Storage, state: StoredState): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable or full; editing must continue in memory.
  }
}
