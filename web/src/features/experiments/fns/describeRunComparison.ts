/**
 * Hover text for a comparison chip. Names the baseline and this run, then the
 * two values, so `+0.07` still says which side is which. A score drops the
 * verb; cost and latency keep theirs, because a bare number does not say
 * which metric it is.
 */
export function describeRunComparison({
  baselineName,
  baselineText,
  currentText,
  verb = "scored",
}: {
  /** The baseline run's name; omitted while the names are still loading. */
  baselineName?: string;
  /** Both sides pre-formatted by the caller, so they read as the cell does. */
  baselineText: string;
  currentText: string;
  /** "scored" for a score, "cost" for cost, "took" for latency. */
  verb?: "scored" | "cost" | "took";
}): string {
  const baseline = baselineName ?? "The baseline";
  if (verb === "scored") {
    return `${baseline} ${baselineText} · this run ${currentText}`;
  }
  return `${baseline} ${verb} ${baselineText} · this run ${verb} ${currentText}`;
}
