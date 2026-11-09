/** Returns the first link of `error`'s cause chain matching `predicate`; cycle-safe. */
export const findInCauseChain = (
  error: unknown,
  predicate: (link: object) => boolean,
): object | undefined => {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    if (predicate(current)) return current;
    seen.add(current);
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
};
