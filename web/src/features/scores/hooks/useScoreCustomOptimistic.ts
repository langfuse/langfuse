import { useCallback, useState, useRef } from "react";

/**
 * An enhanced optimistic state management hook that handles concurrent operations
 * and ensures state is properly synchronized
 */
export function useScoreCustomOptimistic<State, Action>(
  initialState: State,
  reducer: (state: State, action: Action) => State,
): [State, (action: Action) => void] {
  const [state, setState] = useState<State>(initialState);

  // Track sequence number of operations to help with deduplication
  const sequenceCounter = useRef(0);
  // Track operations that are currently in-flight
  const pendingOperations = useRef(new Map<number, Action>());

  const dispatch = useCallback(
    (action: Action) => {
      // Generate a unique sequence number for this operation
      const seq = sequenceCounter.current++;

      // Store this action as pending
      pendingOperations.current.set(seq, action);

      // Apply the optimistic update immediately
      setState((currentState) => {
        try {
          return reducer(currentState, action);
        } catch (error) {
          console.error("Error applying optimistic update:", error);
          return currentState;
        }
      });

      setTimeout(() => {
        if (pendingOperations.current.has(seq)) {
          pendingOperations.current.delete(seq);
        }
      }, 30000); // 30-second timeout
    },
    [reducer],
  );

  return [state, dispatch];
}
