import type { SetStateAction } from "react";

export function evaluateSetStateAction<T>(
  action: SetStateAction<T>,
  previousState: T,
) {
  if (typeof action === "function") {
    return (action as (previousState: T) => T)(previousState);
  }

  return action;
}
