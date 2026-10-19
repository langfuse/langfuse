import { useState } from "react";

/**
 * Returns `value`, except while `hold` is true, when it keeps returning the
 * last value seen unheld.
 */
export function useLatched<T>(value: T, hold: boolean): T {
  const [latched, setLatched] = useState(value);
  if (!hold && !Object.is(latched, value)) setLatched(value);
  return hold ? latched : value;
}
