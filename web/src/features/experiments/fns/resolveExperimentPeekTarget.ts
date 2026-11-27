import { type ExperimentItemData } from "../components/table/types";

/**
 * Which run's trace the peek should open for an item.
 *
 * A click on one experiment's cell names that experiment and wins. Otherwise
 * the row itself was clicked: use the explicit baseline when there is one, and
 * without one fall back to the first selected run purely so the peek has a
 * primary trace to render — that fallback is not a baseline for comparison.
 *
 * Resolution reads the item's run list, never its outputs, so a run that
 * legitimately produced an empty output still resolves to its own trace.
 */
export function resolveExperimentPeekTarget({
  experiments,
  baselineId,
  clickedExperimentId,
}: {
  experiments: ExperimentItemData[];
  baselineId?: string | null;
  clickedExperimentId?: string;
}): ExperimentItemData | undefined {
  if (clickedExperimentId) {
    return experiments.find((e) => e.experimentId === clickedExperimentId);
  }
  if (baselineId) {
    return experiments.find((e) => e.experimentId === baselineId);
  }
  return experiments[0];
}
