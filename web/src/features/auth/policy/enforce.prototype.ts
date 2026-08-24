/**
 * PROTOTYPE — THROWAWAY, does not merge (branch `prototype/enforcement-seams`,
 * LFE-15038). Shared header normalization for the api adapters.
 */

/** headerValue normalizes a possibly-repeated header to its first value. */
export const headerValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);
