import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { type UrlUpdateType } from "use-query-params";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";
import { AUTO_SELECT_COMPARISON_STORAGE_KEY } from "@/src/features/experiments/constants/comparison";

type UseExperimentComparisonAutoSelectProps = {
  projectId: string;
  baselineId?: string;
  comparisonIds: string[];
  onComparisonIdsChange: (
    ids: string[],
    options?: { updateType?: UrlUpdateType },
  ) => void;
};

/**
 * A results page opened without a comparison shows no movement at all, which is
 * where three out of four users stop. Default to the previous run on the same
 * dataset and write it into the URL like a user's own pick, so the view stays
 * shareable, with a preference for anyone who would rather choose themselves.
 */
export function useExperimentComparisonAutoSelect({
  projectId,
  baselineId,
  comparisonIds,
  onComparisonIdsChange,
}: UseExperimentComparisonAutoSelectProps) {
  const router = useRouter();
  const [isAutoSelectEnabled, setIsAutoSelectEnabled] =
    useLocalStorage<boolean>(AUTO_SELECT_COMPARISON_STORAGE_KEY, true);
  const { experimentNames, isLoading } = useExperimentNames({ projectId });

  // At most one attempt per baseline while mounted: clearing the auto-selected
  // comparison must not be undone on the next render. It cannot outlive the
  // mount — an empty selection drops `c` from the URL entirely, so a reload
  // cannot tell "cleared" from "never chosen" and defaults again. The
  // preference below is the durable way to opt out.
  const attemptedForBaselineRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isAutoSelectEnabled || !baselineId || isLoading) return;
    // Query-param writes issued before the router is ready are dropped, and the
    // URL's own `c=` is not readable yet, so nothing here can be trusted.
    if (!router.isReady) return;
    if (attemptedForBaselineRef.current === baselineId) return;

    const baseline = experimentNames.find(
      (experiment) => experiment.experimentId === baselineId,
    );
    if (!baseline) return;

    attemptedForBaselineRef.current = baselineId;

    // The URL already carries a choice.
    if (comparisonIds.length > 0) return;
    // Never guess across datasets: a run on another dataset scored other items.
    if (!baseline.datasetId) return;

    // experimentNames is newest-first, so this is the run that ran before it.
    const previousRun = experimentNames.find(
      (experiment) =>
        experiment.datasetId === baseline.datasetId &&
        experiment.experimentId !== baselineId &&
        experiment.startTime.getTime() <= baseline.startTime.getTime(),
    );
    // The only run on its dataset — there is nothing to compare it to.
    if (!previousRun) return;

    onComparisonIdsChange([previousRun.experimentId], {
      updateType: "replaceIn",
    });
  }, [
    isAutoSelectEnabled,
    baselineId,
    isLoading,
    router.isReady,
    experimentNames,
    comparisonIds,
    onComparisonIdsChange,
  ]);

  return { isAutoSelectEnabled, setIsAutoSelectEnabled };
}
