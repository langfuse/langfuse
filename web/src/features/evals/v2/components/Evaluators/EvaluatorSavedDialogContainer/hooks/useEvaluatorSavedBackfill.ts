import { BatchEvalSourceTable, type FilterState } from "@langfuse/shared";
import { endOfDay, startOfDay, subDays, subHours, subMonths } from "date-fns";
import { useCallback, useRef, useState } from "react";
import type {
  EvaluatorBackfillRange,
  EvaluatorBackfillWindow,
} from "@/src/features/evals/v2/components/Evaluators/EvaluatorBackfillSettings/EvaluatorBackfillSettings";
import {
  DEFAULT_EVALUATOR_BACKFILL_ITEMS,
  MAX_EVALUATOR_BACKFILL_ITEMS,
} from "@/src/features/evals/v2/constants/evaluatorBackfill";
import { api } from "@/src/utils/api";
import { trpcErrorToast } from "@/src/utils/trpcErrorToast";

type EvaluatorBackfillScope = {
  filter: FilterState;
  sampling: number;
};

function getBackfillRange(
  window: Exclude<EvaluatorBackfillWindow, "custom">,
  now = new Date(),
): EvaluatorBackfillRange {
  switch (window) {
    case "24-hours":
      return { from: subHours(now, 24), to: now };
    case "7-days":
      return { from: subDays(now, 7), to: now };
    case "30-days":
      return { from: subDays(now, 30), to: now };
    case "90-days":
      return { from: subDays(now, 90), to: now };
  }
}

function normalizeBackfillRange(
  nextRange: EvaluatorBackfillRange,
  previousFrom: Date,
  now = new Date(),
): EvaluatorBackfillRange {
  const earliestAllowedStart = startOfDay(subMonths(now, 6));
  const latestAllowedEnd = endOfDay(now);
  const clampDate = (date: Date) =>
    new Date(
      Math.min(
        Math.max(date.getTime(), earliestAllowedStart.getTime()),
        latestAllowedEnd.getTime(),
      ),
    );
  let from = clampDate(nextRange.from);
  let to = clampDate(nextRange.to);

  if (from > to) {
    if (nextRange.from.getTime() !== previousFrom.getTime()) {
      to = clampDate(endOfDay(from));
    } else {
      from = clampDate(startOfDay(to));
    }
  }

  return { from, to };
}

export function useEvaluatorSavedBackfill({
  projectId,
  evaluatorId,
  knownTestRunCostUsd,
  historicEvaluationLimit,
  claimMissingCostTest,
  resetMissingCostTest,
}: {
  projectId: string;
  evaluatorId: string;
  knownTestRunCostUsd?: number;
  historicEvaluationLimit?: number;
  claimMissingCostTest: () => boolean;
  resetMissingCostTest: () => void;
}) {
  const utils = api.useUtils();
  const runEvaluation = api.batchAction.runEvaluation.create.useMutation({
    onError: trpcErrorToast,
  });
  const [enabled, setEnabledState] = useState(false);
  const [window, setWindow] = useState<EvaluatorBackfillWindow>("7-days");
  const [range, setRange] = useState<EvaluatorBackfillRange>(() =>
    getBackfillRange("7-days"),
  );
  const [maxItems, setMaxItems] = useState(DEFAULT_EVALUATOR_BACKFILL_ITEMS);
  const [matchingObservations, setMatchingObservations] = useState(0);
  const [testRunCostUsd, setTestRunCostUsd] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const estimateRequestId = useRef(0);
  const hasScheduled = useRef(false);

  const requestEstimate = useCallback(
    async (scope: EvaluatorBackfillScope, estimateRange = range) => {
      const requestId = ++estimateRequestId.current;
      setIsEstimating(true);
      try {
        const shouldRunMissingTest = claimMissingCostTest();
        const result =
          await utils.client.evalsV2.activationCostEstimates.mutate({
            projectId,
            evaluatorIds: [evaluatorId],
            filter: scope.filter,
            sampling: scope.sampling,
            shouldRunMissingTest,
            timeRange: estimateRange,
            ...(knownTestRunCostUsd !== undefined
              ? { knownTestRunCostUsd }
              : {}),
          });
        if (estimateRequestId.current !== requestId) return;
        const estimate = result.find(
          ({ evaluatorId: resultEvaluatorId }) =>
            resultEvaluatorId === evaluatorId,
        );
        if (shouldRunMissingTest && estimate?.matchingObservations === 0) {
          resetMissingCostTest();
        }
        setMatchingObservations(estimate?.matchingObservations ?? 0);
        setTestRunCostUsd(estimate?.testRunCostUsd ?? null);
      } catch (error) {
        if (estimateRequestId.current === requestId) {
          setMatchingObservations(0);
          setTestRunCostUsd(null);
          trpcErrorToast(error);
        }
      } finally {
        if (estimateRequestId.current === requestId) {
          setIsEstimating(false);
        }
      }
    },
    [
      claimMissingCostTest,
      evaluatorId,
      knownTestRunCostUsd,
      projectId,
      range,
      resetMissingCostTest,
      utils.client,
    ],
  );

  const clearScope = useCallback(() => {
    estimateRequestId.current += 1;
    setIsEstimating(false);
    setEnabledState(false);
    setMatchingObservations(0);
    setTestRunCostUsd(null);
  }, []);

  const setEnabled = useCallback(
    (nextEnabled: boolean, scope: EvaluatorBackfillScope | null) => {
      setEnabledState(nextEnabled);
      if (!nextEnabled) {
        estimateRequestId.current += 1;
        setIsEstimating(false);
        return;
      }

      const defaultWindow: EvaluatorBackfillWindow = "7-days";
      const defaultRange = getBackfillRange(defaultWindow);
      setWindow(defaultWindow);
      setRange(defaultRange);
      if (scope) {
        requestEstimate(scope, defaultRange).catch(() => undefined);
      }
    },
    [requestEstimate],
  );

  const updateRange = useCallback(
    (
      nextRange: EvaluatorBackfillRange,
      scope: EvaluatorBackfillScope | null,
    ) => {
      const clampedRange = normalizeBackfillRange(nextRange, range.from);
      setRange(clampedRange);
      if (scope) {
        requestEstimate(scope, clampedRange).catch(() => undefined);
      }
    },
    [range.from, requestEstimate],
  );

  const updateWindow = useCallback(
    (
      nextWindow: EvaluatorBackfillWindow,
      scope: EvaluatorBackfillScope | null,
    ) => {
      setWindow(nextWindow);
      if (nextWindow !== "custom") {
        updateRange(getBackfillRange(nextWindow), scope);
      }
    },
    [updateRange],
  );

  const allowedItems = Math.min(
    historicEvaluationLimit ?? MAX_EVALUATOR_BACKFILL_ITEMS,
    MAX_EVALUATOR_BACKFILL_ITEMS,
  );
  const effectiveMaxItems = Math.min(maxItems, allowedItems);
  const executionRange = window === "custom" ? range : getBackfillRange(window);

  const schedule = async (
    scope: EvaluatorBackfillScope,
    executionRange: EvaluatorBackfillRange,
  ) => {
    if (!enabled || hasScheduled.current) return;
    const normalizedExecutionRange = normalizeBackfillRange(
      executionRange,
      range.from,
    );
    await runEvaluation.mutateAsync({
      projectId,
      query: {
        filter: [
          ...scope.filter,
          {
            column: "startTime",
            type: "datetime",
            operator: ">=",
            value: normalizedExecutionRange.from,
          },
          {
            column: "startTime",
            type: "datetime",
            operator: "<=",
            value: normalizedExecutionRange.to,
          },
        ],
        orderBy: { column: "startTime", order: "DESC" },
        useEventsTable: true,
      },
      evaluatorIds: [evaluatorId],
      evaluatorMappings: [{ evaluatorId, variableMapping: null }],
      evalVersion: "v2",
      sourceTable: BatchEvalSourceTable.EVENTS,
      sampling: scope.sampling,
      rowLimit: effectiveMaxItems,
    });
    hasScheduled.current = true;
  };

  return {
    enabled,
    window,
    range,
    effectiveMaxItems,
    allowedItems,
    matchingObservations,
    testRunCostUsd,
    isEstimating,
    isScheduling: runEvaluation.isPending,
    executionRange,
    requestEstimate,
    clearScope,
    setEnabled,
    updateRange,
    updateWindow,
    setMaxItems,
    schedule,
  };
}
