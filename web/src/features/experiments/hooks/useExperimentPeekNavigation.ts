import { useCallback, useMemo } from "react";
import { useQueryParam, StringParam } from "use-query-params";
import { useRouter } from "next/router";
import { useExperimentResultsState } from "./useExperimentResultsState";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";

type ExperimentTarget = {
  traceId: string;
  observationId: string;
  timestamp: string;
};

/**
 * Hook for navigating between experiments in the peek view.
 * Reads experiment targets from the detail page list context and manages
 * the current experiment selection via URL state.
 */
export function useExperimentPeekNavigation() {
  const router = useRouter();
  const { baselineId, comparisonIds } = useExperimentResultsState();
  const { detailPagelists } = useDetailPageLists();
  const [peekExperimentId, setPeekExperimentId] = useQueryParam(
    "peekExperimentId",
    StringParam,
  );

  const peekItemId = router.query.peek as string | undefined;

  // Ordered experiment list: baseline first, then comparisons
  const allExperimentIds = useMemo(() => {
    const ids: string[] = [];
    if (baselineId) ids.push(baselineId);
    ids.push(...comparisonIds.filter((id) => id !== baselineId));
    return ids;
  }, [baselineId, comparisonIds]);

  // Get stored targets from detail page list
  const experimentTargets = useMemo(():
    | Record<string, ExperimentTarget>
    | undefined => {
    if (!peekItemId) return undefined;
    const list = detailPagelists["experiment-items"];
    const entry = list?.find((e) => e.id === peekItemId);
    if (!entry?.params?.experimentTargets) return undefined;
    try {
      return JSON.parse(entry.params.experimentTargets as string) as Record<
        string,
        ExperimentTarget
      >;
    } catch {
      return undefined;
    }
  }, [detailPagelists, peekItemId]);

  // Current experiment (defaults to baseline)
  const currentExperimentId =
    peekExperimentId ?? baselineId ?? allExperimentIds[0];
  const currentIndex = allExperimentIds.indexOf(currentExperimentId ?? "");

  // Current target for trace rendering
  const currentTarget = experimentTargets?.[currentExperimentId ?? ""] ?? null;

  const goTo = useCallback(
    (experimentId: string) => {
      const target = experimentTargets?.[experimentId];
      if (!target) {
        // Fall back to just updating peekExperimentId if we don't have targets
        setPeekExperimentId(experimentId);
        return;
      }

      // Update URL with new experiment and its trace params
      const params = new URLSearchParams(window.location.search);
      params.set("peekExperimentId", experimentId);
      params.set("traceId", target.traceId);
      params.set("timestamp", target.timestamp);
      params.set("observation", target.observationId);

      // Use window.location.pathname to get the resolved path (not the Next.js pattern)
      const pathname = window.location.pathname;
      router.push(`${pathname}?${params.toString()}`, undefined, {
        shallow: true,
      });
    },
    [experimentTargets, router, setPeekExperimentId],
  );

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      goTo(allExperimentIds[currentIndex - 1]);
    }
  }, [currentIndex, allExperimentIds, goTo]);

  const goToNext = useCallback(() => {
    if (currentIndex < allExperimentIds.length - 1) {
      goTo(allExperimentIds[currentIndex + 1]);
    }
  }, [currentIndex, allExperimentIds, goTo]);

  return {
    currentExperimentId,
    currentTarget,
    currentIndex,
    total: allExperimentIds.length,
    allExperimentIds,
    hasPrev: currentIndex > 0,
    hasNext: currentIndex < allExperimentIds.length - 1,
    goToPrev,
    goToNext,
    goTo,
    // Can switch if we have targets stored and more than one experiment
    canSwitch: !!experimentTargets && allExperimentIds.length > 1,
  };
}
