import { EvalTemplateType } from "@langfuse/shared";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";
import { api } from "@/src/utils/api";

export type RuleCostEstimate = {
  evaluatorId: string;
  evaluatorName: string;
  matchingObservations: number;
  sampling: number;
  testRunCostUsd: number | null;
  estimatedCostUsd: number | null;
  evaluatorType: EvalTemplateType;
  period?: "week" | "selection";
};

const ESTIMATE_DEBOUNCE_MS = 500;

type EstimateState = {
  status: "idle" | "estimating" | "error";
  estimates: RuleCostEstimate[];
  estimatingEvaluatorIds: string[];
};

export function useRuleCostEstimate({
  projectId,
  store,
  matchingObservations: matchingObservationsOverride,
}: {
  projectId: string;
  store: RuleSetupStore;
  matchingObservations?: number;
}) {
  const { filter, sampling, assignments } = useStore(
    store,
    useShallow((state) => ({
      filter: state.filter,
      sampling: state.sampling,
      assignments: state.assignments,
    })),
  );
  const { mutateAsync: estimateCost } =
    api.evalsV2.activationCostEstimates.useMutation();
  const requestId = useRef(0);
  const previousFilter = useRef<string | null>(null);
  // Probing an unpriced evaluator costs a real LLM call. Editing the filter
  // re-estimates, but must not re-probe an evaluator we already probed — if the
  // first probe produced no usable price, every later edit would pay again.
  const probedEvaluatorIds = useRef(new Set<string>());
  const stateRef = useRef<EstimateState>({
    status: "idle",
    estimates: [],
    estimatingEvaluatorIds: [],
  });
  const [state, setState] = useState<EstimateState>(stateRef.current);

  useEffect(() => {
    const updateState = (nextState: EstimateState) => {
      stateRef.current = nextState;
      setState(nextState);
    };
    const currentRequestId = ++requestId.current;
    const filterSignature = JSON.stringify(filter);
    const filterChanged = previousFilter.current !== filterSignature;
    previousFilter.current = filterSignature;
    const currentEvaluatorIds = new Set(
      assignments.map(({ evaluatorId }) => evaluatorId),
    );
    const previousEstimates = stateRef.current.estimates.filter(
      ({ evaluatorId }) => currentEvaluatorIds.has(evaluatorId),
    );
    const previousEstimatesById = new Map(
      previousEstimates.map((estimate) => [estimate.evaluatorId, estimate]),
    );
    const firstMatchingObservationCount =
      previousEstimates[0]?.matchingObservations ?? 0;
    const codeEstimates = assignments
      .filter(({ evaluatorType }) => evaluatorType === EvalTemplateType.CODE)
      .map(({ evaluatorId, evaluatorName }) => ({
        evaluatorId,
        evaluatorName,
        matchingObservations: firstMatchingObservationCount,
        sampling: 1,
        testRunCostUsd: 0,
        estimatedCostUsd: 0,
        evaluatorType: EvalTemplateType.CODE,
      }));
    const llmAssignmentsToEstimate = assignments.filter(
      ({ evaluatorId, evaluatorType }) =>
        evaluatorType === EvalTemplateType.LLM_AS_JUDGE &&
        (filterChanged || !previousEstimatesById.has(evaluatorId)),
    );
    const retainedLlmEstimates = filterChanged
      ? []
      : previousEstimates.filter(({ evaluatorId }) =>
          assignments.some(
            (assignment) =>
              assignment.evaluatorId === evaluatorId &&
              assignment.evaluatorType === EvalTemplateType.LLM_AS_JUDGE,
          ),
        );
    const estimatingEvaluatorIds = llmAssignmentsToEstimate.map(
      ({ evaluatorId }) => evaluatorId,
    );

    if (assignments.length === 0) {
      updateState({
        status: "idle",
        estimates: [],
        estimatingEvaluatorIds: [],
      });
      return;
    }

    if (llmAssignmentsToEstimate.length === 0) {
      updateState({
        status: "idle",
        estimates: [...retainedLlmEstimates, ...codeEstimates],
        estimatingEvaluatorIds: [],
      });
      return;
    }

    updateState({
      status: "estimating",
      estimates: [...retainedLlmEstimates, ...codeEstimates],
      estimatingEvaluatorIds,
    });
    const timeout = window.setTimeout(() => {
      const unprobedEvaluatorIds = estimatingEvaluatorIds.filter(
        (evaluatorId) => !probedEvaluatorIds.current.has(evaluatorId),
      );
      estimatingEvaluatorIds.forEach((evaluatorId) =>
        probedEvaluatorIds.current.add(evaluatorId),
      );
      estimateCost({
        projectId,
        evaluatorIds: estimatingEvaluatorIds,
        filter,
        sampling: 1,
        // This matches activation behavior: an evaluator without a priced test
        // gets one representative test so its estimate can become available.
        shouldRunMissingTest: unprobedEvaluatorIds.length > 0,
      })
        .then((results) => {
          if (requestId.current !== currentRequestId) return;
          const namesById = new Map(
            assignments.map(({ evaluatorId, evaluatorName }) => [
              evaluatorId,
              evaluatorName,
            ]),
          );
          const newEstimatesById = new Map(
            results.map((result) => [
              result.evaluatorId,
              {
                ...result,
                evaluatorName:
                  namesById.get(result.evaluatorId) ?? result.evaluatorId,
                evaluatorType: EvalTemplateType.LLM_AS_JUDGE,
              },
            ]),
          );
          updateState({
            status: "idle",
            estimates: assignments.flatMap((assignment): RuleCostEstimate[] => {
              if (assignment.evaluatorType === EvalTemplateType.CODE) {
                return codeEstimates.filter(
                  ({ evaluatorId }) => evaluatorId === assignment.evaluatorId,
                );
              }
              const estimate =
                newEstimatesById.get(assignment.evaluatorId) ??
                previousEstimatesById.get(assignment.evaluatorId);
              return estimate ? [estimate] : [];
            }),
            estimatingEvaluatorIds: [],
          });
        })
        .catch(() => {
          if (requestId.current !== currentRequestId) return;
          updateState({
            status: "error",
            estimates: [...retainedLlmEstimates, ...codeEstimates],
            estimatingEvaluatorIds: [],
          });
        });
    }, ESTIMATE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [assignments, estimateCost, filter, projectId]);

  return {
    ...state,
    estimates: state.estimates.map((estimate) => {
      const matchingObservations =
        matchingObservationsOverride ?? estimate.matchingObservations;
      return {
        ...estimate,
        matchingObservations,
        sampling,
        period:
          matchingObservationsOverride === undefined
            ? ("week" as const)
            : ("selection" as const),
        estimatedCostUsd:
          matchingObservations === 0
            ? 0
            : estimate.testRunCostUsd === null
              ? null
              : matchingObservations * sampling * estimate.testRunCostUsd,
      };
    }),
  };
}
