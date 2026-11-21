import { useEffect, useRef } from "react";

/** Returns the value saved after the previous committed render. */
export function usePrevious<T>(value: T, shouldSave = true): T | undefined {
  const previous = useRef<T | undefined>(undefined);

  useEffect(() => {
    if (shouldSave) previous.current = value;
  }, [value, shouldSave]);

  return previous.current;
}
