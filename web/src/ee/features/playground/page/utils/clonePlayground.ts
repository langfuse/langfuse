import { v4 as uuidv4 } from "uuid";
import type { PlaygroundState } from "../types";
import type { ChatMessageWithId } from "@langfuse/shared";

/**
 * Deep-clone a playground state so that the resulting object is completely
 * detached from the original and can be safely mutated.
 *
 * The function
 *   • creates a new top-level `id`
 *   • generates fresh `id`s for every chat message to avoid key clashes in React
 *     lists (the provider logic relies on unique ids)
 *
 * NOTE:
 * – We intentionally keep tool-call ids unchanged (this mirrors the behaviour
 *   when loading a cached playground in the current implementation).
 */
export function clonePlayground(original: PlaygroundState): PlaygroundState {
  // Use structuredClone when available (Node ≥ 17 / modern browsers).
  // Fallback to JSON parse/stringify for environments where it is missing.
  /* eslint-disable @typescript-eslint/no-unsafe-assignment */
  const deepCopy: PlaygroundState =
    typeof structuredClone === "function"
      ? structuredClone(original)
      : (JSON.parse(JSON.stringify(original)) as PlaygroundState);
  /* eslint-enable @typescript-eslint/no-unsafe-assignment */

  // Assign fresh ids so React keys don't collide.
  deepCopy.id = uuidv4();
  deepCopy.messages = deepCopy.messages.map((m: ChatMessageWithId) => ({
    ...m,
    id: uuidv4(),
  }));

  return deepCopy;
}
