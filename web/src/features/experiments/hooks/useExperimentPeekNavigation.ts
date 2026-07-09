import { useCallback, useMemo } from "react";
import { useQueryParam, StringParam } from "use-query-params";
import { useRouter } from "next/router";
import { useExperimentResultsState } from "./useExperimentResultsState";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { getPathnameWithoutBasePath } from "@/src/utils/api";

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
  const { allExperimentIds } = useExperimentResultsState();
  const { detailPagelists } = useDetailPageLists();
  const [peekExperimentId] = useQueryParam("peekExperimentId", StringParam);

  const peekItemId = router.query.peek as string | undefined;

  // Get stored targets from detail page list
  const experimentTargets = useMemo(():
    | Record<string, ExperimentTarget>
    | undefined => {
    if (!peekItemId) return undefined;
    const list = detailPagelists["experiment-items"];
    const entry = list?.find((e) => e.id === peekItemId);
    return entry?.meta?.experimentTargets as
      | Record<string, ExperimentTarget>
      | undefined;
  }, [detailPagelists, peekItemId]);

  // Current experiment: validate peekExperimentId is in allExperimentIds, fall back to first
  const rawIndex = allExperimentIds.indexOf(peekExperimentId ?? "");
  const currentIndex = rawIndex >= 0 ? rawIndex : 0;
  const currentExperimentId = allExperimentIds[currentIndex];

  // Current target for trace rendering
  const currentTarget = experimentTargets?.[currentExperimentId ?? ""] ?? null;

  // Check if prev/next have targets available
  const prevId = currentIndex > 0 ? allExperimentIds[currentIndex - 1] : null;
  const nextId =
    currentIndex < allExperimentIds.length - 1
      ? allExperimentIds[currentIndex + 1]
      : null;
  const hasPrev = !!(prevId && experimentTargets?.[prevId]);
  const hasNext = !!(nextId && experimentTargets?.[nextId]);

  const goTo = useCallback(
    (experimentId: string) => {
      const target = experimentTargets?.[experimentId];
      if (!target) return;

      const params = new URLSearchParams(window.location.search);
      params.set("peekExperimentId", experimentId);
      params.set("traceId", target.traceId);
      params.set("timestamp", target.timestamp);
      params.set("observation", target.observationId);

      // router.push re-prepends NEXT_PUBLIC_BASE_PATH, so strip it first
      const pathname = getPathnameWithoutBasePath();
      router.push(`${pathname}?${params.toString()}`, undefined, {
        shallow: true,
      });
    },
    [experimentTargets, router],
  );

  const goToPrev = useCallback(() => {
    if (prevId && hasPrev) goTo(prevId);
  }, [prevId, hasPrev, goTo]);

  const goToNext = useCallback(() => {
    if (nextId && hasNext) goTo(nextId);
  }, [nextId, hasNext, goTo]);

  return {
    currentExperimentId,
    currentTarget,
    currentIndex,
    total: allExperimentIds.length,
    allExperimentIds,
    hasPrev,
    hasNext,
    goToPrev,
    goToNext,
    goTo,
    canSwitch: !!experimentTargets && allExperimentIds.length > 1,
  };
}
