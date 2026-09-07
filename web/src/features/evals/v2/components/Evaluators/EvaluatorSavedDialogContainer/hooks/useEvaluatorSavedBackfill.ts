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

export function useEvaluatorSavedBackfill({
  projectId,
  evaluatorId,
  historicEvaluationLimit,
}: {
  projectId: string;
  evaluatorId: string;
  historicEvaluationLimit?: number;
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
  const [isEstimating, setIsEstimating] = useState(false);
  const estimateRequestId = useRef(0);
  const hasScheduled = useRef(false);

  const requestEstimate = useCallback(
    async (scope: EvaluatorBackfillScope, estimateRange = range) => {
      const requestId = ++estimateRequestId.current;
      setIsEstimating(true);
      try {
        const result =
          await utils.client.evalsV2.activationCostEstimates.mutate({
            projectId,
            evaluatorIds: [evaluatorId],
            filter: scope.filter,
            sampling: scope.sampling,
            shouldRunMissingTest: false,
            timeRange: estimateRange,
          });
        if (estimateRequestId.current !== requestId) return;
        setMatchingObservations(
          Math.max(
            0,
            ...result.map(({ matchingObservations }) => matchingObservations),
          ),
        );
      } catch (error) {
        if (estimateRequestId.current === requestId) {
          setMatchingObservations(0);
          trpcErrorToast(error);
        }
      } finally {
        if (estimateRequestId.current === requestId) {
          setIsEstimating(false);
        }
      }
    },
    [evaluatorId, projectId, range, utils.client],
  );

  const clearScope = useCallback(() => {
    estimateRequestId.current += 1;
    setIsEstimating(false);
    setEnabledState(false);
    setMatchingObservations(0);
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
      const now = new Date();
      const earliestAllowedStart = subMonths(now, 6);
      let from =
        nextRange.from < earliestAllowedStart
          ? earliestAllowedStart
          : nextRange.from;
      let to = nextRange.to > now ? now : nextRange.to;
      if (from > to) {
        if (nextRange.from.getTime() !== range.from.getTime()) {
          to = endOfDay(from);
        } else {
          from = startOfDay(to);
        }
      }
      const clampedRange = { from, to };
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
    await runEvaluation.mutateAsync({
      projectId,
      query: {
        filter: [
          ...scope.filter,
          {
            column: "startTime",
            type: "datetime",
            operator: ">=",
            value: executionRange.from,
          },
          {
            column: "startTime",
            type: "datetime",
            operator: "<=",
            value: executionRange.to,
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
