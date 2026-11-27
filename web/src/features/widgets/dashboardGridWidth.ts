export type WidthPhase = "quiet" | "pending";

/**
 * A sample after a quiet period is published immediately. Further samples
 * while a settle timer is pending are held for the trailing publish.
 */
export function reduceWidthSample(
  phase: WidthPhase,
  sample: number,
  committed: number | null,
): { phase: WidthPhase; publish: number | null; armTimer: boolean } {
  if (sample <= 0 || sample === committed) {
    return { phase, publish: null, armTimer: false };
  }
  if (phase === "quiet") {
    return { phase: "pending", publish: sample, armTimer: true };
  }
  return { phase: "pending", publish: null, armTimer: true };
}
