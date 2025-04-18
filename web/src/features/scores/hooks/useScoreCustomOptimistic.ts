import { useCallback, useState } from "react";

export function useScoreCustomOptimistic<State, Action>(
  initialState: State,
  reducer: (state: State, action: Action) => State,
): [State, (action: Action) => void] {
  const [state, setState] = useState<State>(initialState);

  const dispatch = useCallback(
    (action: Action) => {
      setState((currentState) => reducer(currentState, action));
    },
    [reducer],
  );

  return [state, dispatch];
}
