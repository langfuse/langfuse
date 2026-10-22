import { type SyntheticEvent } from "react";

export function stopScrollPropagation<E extends SyntheticEvent>(
  handler?: (event: E) => void,
) {
  return (event: E) => {
    event.stopPropagation();
    handler?.(event);
  };
}
