import { useStore } from "zustand";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/src/components/ui/card";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  EvaluatorAssignmentsEditor,
  type RuleEvaluatorOption,
} from "@/src/features/evals";
import {
  useRuleCostEstimate,
  type RuleCostEstimate,
} from "@/src/features/evals/v2/hooks/useRuleCostEstimate";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";
import { usdFormatter } from "@/src/utils/numbers";

export function EvaluatorMappingStep({
  projectId,
  store,
  evaluatorOptions,
  isQueryLoading,
  isQueryError,
  queryErrorMessage,
  search,
  onSearchChange,
  sampleObject,
  costObservationCount,
}: {
  projectId: string;
  store: RuleSetupStore;
  evaluatorOptions: RuleEvaluatorOption[];
  isQueryLoading: boolean;
  isQueryError: boolean;
  queryErrorMessage: string | undefined;
  search: string;
  onSearchChange: (value: string) => void;
  sampleObject: Record<string, unknown> | null;
  costObservationCount: number | null;
}) {
  if (costObservationCount == null) {
    return (
      <EvaluatorMappingEditor
        store={store}
        evaluatorOptions={evaluatorOptions}
        isQueryLoading={isQueryLoading}
        isQueryError={isQueryError}
        queryErrorMessage={queryErrorMessage}
        search={search}
        onSearchChange={onSearchChange}
        sampleObject={sampleObject}
        costEstimates={[]}
        estimatingEvaluatorIds={[]}
        footerTrailing={
          <p className="text-muted-foreground max-w-64 text-right text-xs">
            Cost estimate unavailable for experiment-scoped evaluations
          </p>
        }
        costError={false}
      />
    );
  }

  return (
    <EvaluatorMappingStepWithCosts
      projectId={projectId}
      store={store}
      evaluatorOptions={evaluatorOptions}
      isQueryLoading={isQueryLoading}
      isQueryError={isQueryError}
      queryErrorMessage={queryErrorMessage}
      search={search}
      onSearchChange={onSearchChange}
      sampleObject={sampleObject}
      costObservationCount={costObservationCount}
    />
  );
}

function EvaluatorMappingStepWithCosts({
  projectId,
  store,
  evaluatorOptions,
  isQueryLoading,
  isQueryError,
  queryErrorMessage,
  search,
  onSearchChange,
  sampleObject,
  costObservationCount,
}: {
  projectId: string;
  store: RuleSetupStore;
  evaluatorOptions: RuleEvaluatorOption[];
  isQueryLoading: boolean;
  isQueryError: boolean;
  queryErrorMessage: string | undefined;
  search: string;
  onSearchChange: (value: string) => void;
  sampleObject: Record<string, unknown> | null;
  costObservationCount: number;
}) {
  const assignments = useStore(store, (state) => state.assignments);
  const costEstimate = useRuleCostEstimate({
    projectId,
    store,
    matchingObservations: costObservationCount,
  });
  const availableEstimates = costEstimate.estimates.filter(
    (estimate) => estimate.estimatedCostUsd !== null,
  );
  const totalCostUsd = availableEstimates.reduce(
    (total, estimate) => total + (estimate.estimatedCostUsd ?? 0),
    0,
  );
  const footerTrailing =
    assignments.length > 0 ? (
      <div className="w-48 border-t pt-2 text-right text-sm">
        {availableEstimates.length > 0 ? (
          <div>
            <div className="flex items-center justify-end gap-1.5">
              <p className="font-mono leading-none font-bold whitespace-nowrap tabular-nums">
                ≈ {usdFormatter(totalCostUsd, 2, 2)}
              </p>
              <InfoTooltip label="About total estimated LLM costs">
                Sum of the available LLM cost estimates for this run.
              </InfoTooltip>
            </div>
            <p className="text-muted-foreground text-xs whitespace-nowrap">
              estimated LLM costs for this run
            </p>
          </div>
        ) : costEstimate.status === "estimating" ? (
          <Skeleton className="ml-auto h-5 w-28" />
        ) : (
          <div>
            <p className="font-mono font-bold">Unavailable</p>
            <p className="text-muted-foreground text-xs whitespace-nowrap">
              estimated LLM costs for this run
            </p>
          </div>
        )}
      </div>
    ) : null;

  return (
    <EvaluatorMappingEditor
      store={store}
      evaluatorOptions={evaluatorOptions}
      isQueryLoading={isQueryLoading}
      isQueryError={isQueryError}
      queryErrorMessage={queryErrorMessage}
      search={search}
      onSearchChange={onSearchChange}
      sampleObject={sampleObject}
      costEstimates={costEstimate.estimates}
      estimatingEvaluatorIds={costEstimate.estimatingEvaluatorIds}
      footerTrailing={footerTrailing}
      costError={costEstimate.status === "error" && assignments.length > 0}
    />
  );
}

function EvaluatorMappingEditor({
  store,
  evaluatorOptions,
  isQueryLoading,
  isQueryError,
  queryErrorMessage,
  search,
  onSearchChange,
  sampleObject,
  costEstimates,
  estimatingEvaluatorIds,
  footerTrailing,
  costError,
}: {
  store: RuleSetupStore;
  evaluatorOptions: RuleEvaluatorOption[];
  isQueryLoading: boolean;
  isQueryError: boolean;
  queryErrorMessage: string | undefined;
  search: string;
  onSearchChange: (value: string) => void;
  sampleObject: Record<string, unknown> | null;
  costEstimates: RuleCostEstimate[];
  estimatingEvaluatorIds: string[];
  footerTrailing: ReactNode;
  costError: boolean;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isQueryLoading ? (
          <p className="text-muted-foreground text-sm">Loading evaluators...</p>
        ) : isQueryError ? (
          <Card>
            <CardContent className="text-destructive p-4 text-sm">
              Failed to load evaluators: {queryErrorMessage}
            </CardContent>
          </Card>
        ) : (
          <>
            <EvaluatorAssignmentsEditor
              evaluatorOptions={evaluatorOptions}
              store={store}
              search={search}
              onSearchChange={onSearchChange}
              sampleObject={sampleObject}
              costEstimates={costEstimates}
              estimatingEvaluatorIds={estimatingEvaluatorIds}
              footerTrailing={footerTrailing}
              emptyDescription="Attach an evaluator to score this selection."
              sourceUnavailableMessage="No observation is available to validate JSON paths."
            />
            {costError ? (
              <p className="text-muted-foreground mt-2 text-xs">
                Cost estimates are temporarily unavailable.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
