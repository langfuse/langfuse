import { useCallback } from "react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";
import {
  EXPERIMENT_ANALYTICS_DIMENSIONS,
  type ExperimentComparisonSource,
} from "@/src/features/experiments/constants/analytics";

/**
 * `experiment:comparison_changed` — do people compare at all (three out of four
 * never did), how many runs at once, and against the same dataset? (LFE-15720)
 *
 * Emitted from the user's action, never from the URL state that also changes on
 * navigation and on a restored saved view. Every path that changes the
 * comparison passes its own `source`, so the auto-selected default (C3) and a
 * shared link stay separable from a deliberate pick.
 *
 * `isSameDataset` means "there is at least one comparison and every one of them
 * ran on the baseline's dataset". With `comparisonCount: 0` it is therefore
 * always false — read the two properties together.
 *
 * Ids and counts only: an experiment or dataset NAME is user content.
 */
export function useExperimentComparisonAnalytics({
  projectId,
}: {
  projectId: string;
}) {
  const capture = usePostHogClientCapture();
  const { experimentNames, isLoading } = useExperimentNames({ projectId });

  const captureComparisonChanged = useCallback(
    ({
      baselineId,
      comparisonIds,
      source,
    }: {
      baselineId?: string;
      comparisonIds: string[];
      source: ExperimentComparisonSource;
    }) => {
      const datasetOf = (experimentId: string) =>
        experimentNames.find((exp) => exp.experimentId === experimentId)
          ?.datasetId ?? null;
      const baselineDatasetId = baselineId ? datasetOf(baselineId) : null;

      capture("experiment:comparison_changed", {
        comparisonCount: comparisonIds.length,
        isSameDataset:
          comparisonIds.length > 0 &&
          baselineDatasetId !== null &&
          comparisonIds.every((id) => datasetOf(id) === baselineDatasetId),
        source,
        ...EXPERIMENT_ANALYTICS_DIMENSIONS,
      });
    },
    [capture, experimentNames],
  );

  return { captureComparisonChanged, isDatasetContextLoading: isLoading };
}
