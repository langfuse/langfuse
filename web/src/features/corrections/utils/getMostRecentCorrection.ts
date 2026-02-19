import { type ScoreDomain } from "@langfuse/shared";

/**
 * Extracts the most recent correction from an array of corrections.
 * Sorts by timestamp descending (most recent first) and returns the first item.
 *
 * @param corrections - Array of correction scores
 * @returns The most recent correction or undefined if array is empty
 */
export function getMostRecentCorrection(
  corrections: ScoreDomain[],
): ScoreDomain | undefined {
  if (corrections.length === 0) return undefined;

  return corrections.sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
  )[0];
}
