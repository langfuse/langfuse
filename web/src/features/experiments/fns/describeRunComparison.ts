/**
 * What a comparison chip says on hover. A chip is attached to one run, so the
 * sentence reads from that run's side: the baseline is named, this run is "this
 * run". `a → b` and `+0.07` are ambiguous on their own — the reader cannot tell
 * "was, now is" from "this run vs the comparison" — and this is the sentence
 * that settles it.
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
  return `${baselineName ?? "The baseline"} ${verb} ${baselineText} · this run ${verb} ${currentText}`;
}
