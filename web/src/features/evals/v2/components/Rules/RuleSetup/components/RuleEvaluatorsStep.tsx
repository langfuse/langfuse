/* eslint-disable no-nested-ternary */
import {
  isTraceTranscriptEvalType,
  TopicsTargetObject,
} from "@langfuse/shared";
import { useStore } from "zustand";

import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import { EvaluatorAssignmentsEditor } from "@/src/features/evals/v2/components/Rules/EvaluatorAssignmentsEditor/EvaluatorAssignmentsEditor";
import {
  EvalVariableSourceColumnsProvider,
  TRACE_TRANSCRIPT_SOURCE_COLUMNS,
  useEvalVariableSourceColumns,
} from "@/src/features/evals/v2/contexts/EvalVariableSourceColumnsProvider";
import { buildSelectedSampleObject } from "@/src/features/evals/v2/fns/evaluatorTesting/buildSelectedSampleObject";
import { useEvaluatorTraceSample } from "@/src/features/evals/v2/hooks/useEvaluatorTraceSample";
import type {
  RuleEvaluatorOption,
  RuleSetupStore,
} from "@/src/features/evals/v2/types/rules";
import { api, sendAsPostOption } from "@/src/utils/api";
import { useRuleCostEstimate } from "@/src/features/evals/v2/hooks/useRuleCostEstimate";
import { usdFormatter } from "@/src/utils/numbers";
import { Skeleton } from "@/src/components/ui/skeleton";
import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";

export function RuleEvaluatorsStep({
  projectId,
  evaluatorOptions,
  store,
  search,
  onSearchChange,
}: {
  projectId: string;
  evaluatorOptions: RuleEvaluatorOption[];
  store: RuleSetupStore;
  search: string;
  onSearchChange: (search: string) => void;
}) {
  const selectedObservation = useStore(
    store,
    (state) => state.selectedObservation,
  );
  const isTraceTranscript = useStore(
    store,
    (state) => state.targetObject === TopicsTargetObject,
  );
  const sourceColumns = useEvalVariableSourceColumns();
  const traceSample = useEvaluatorTraceSample({ projectId, store });
  const selectedObservationDetails = api.events.experimentBatchIO.useQuery(
    {
      projectId,
      observations: [
        {
          id: selectedObservation?.id ?? "",
          traceId: selectedObservation?.traceId ?? "",
        },
      ],
      minStartTime: selectedObservation?.startTime ?? new Date(0),
      maxStartTime: selectedObservation?.startTime ?? new Date(0),
      truncated: false,
      includeToolCalls: true,
    },
    {
      ...sendAsPostOption,
      enabled: Boolean(
        !isTraceTranscript &&
        selectedObservation?.id &&
        selectedObservation.traceId &&
        selectedObservation.startTime,
      ),
      select: (data) => data[0],
    },
  );
  const target = isTraceTranscript
    ? {
        noun: "traces",
        sourceColumns: TRACE_TRANSCRIPT_SOURCE_COLUMNS,
        evaluatorOptions: evaluatorOptions.filter(({ type }) =>
          isTraceTranscriptEvalType(type),
        ),
        sampleObject: traceSample.sourceObject,
        sourceUnavailableMessage:
          "No sample trace is available to validate JSON paths.",
        emptyDescription: "Attach an evaluator to run on matching traces.",
      }
    : {
        noun: "observations",
        sourceColumns,
        evaluatorOptions,
        sampleObject: buildSelectedSampleObject({
          observation: selectedObservation,
          eventDetails: selectedObservationDetails.data,
        }),
        sourceUnavailableMessage: undefined,
        emptyDescription: undefined,
      };
  const assignments = useStore(store, (state) => state.assignments);
  const costEstimate = useRuleCostEstimate({ projectId, store });
  const availableEstimates = costEstimate.estimates.filter(
    (estimate) => estimate.estimatedCostUsd !== null,
  );
  const totalCostUsd = availableEstimates.reduce(
    (total, estimate) => total + (estimate.estimatedCostUsd ?? 0),
    0,
  );
  const total =
    assignments.length > 0 ? (
      <div className="w-48 border-t pt-2 text-right text-sm">
        {availableEstimates.length > 0 ? (
          <div>
            <div className="flex items-center justify-end gap-1.5">
              <p className="font-mono leading-none font-bold whitespace-nowrap tabular-nums">
                ≈ {usdFormatter(totalCostUsd, 2, 2)}
              </p>
              <InfoTooltip label="About total estimated LLM costs">
                Sum of the available weekly LLM cost estimates for attached
                evaluators.
              </InfoTooltip>
            </div>
            <p className="text-muted-foreground text-xs whitespace-nowrap">
              estimated LLM costs / week
            </p>
          </div>
        ) : costEstimate.status === "estimating" ? (
          <Skeleton className="ml-auto h-5 w-28" />
        ) : (
          <div>
            <p className="font-mono font-bold">Unavailable</p>
            <p className="text-muted-foreground text-xs whitespace-nowrap">
              estimated LLM costs / week
            </p>
          </div>
        )}
      </div>
    ) : null;

  return (
    <Stepper
      number={2}
      title="Attach evaluators"
      description={`Choose which evaluators should run on matching ${target.noun}.`}
    >
      <EvalVariableSourceColumnsProvider value={target.sourceColumns}>
        <EvaluatorAssignmentsEditor
          evaluatorOptions={target.evaluatorOptions}
          store={store}
          search={search}
          onSearchChange={onSearchChange}
          sampleObject={target.sampleObject}
          sourceUnavailableMessage={target.sourceUnavailableMessage}
          emptyDescription={target.emptyDescription}
          costEstimates={costEstimate.estimates}
          estimatingEvaluatorIds={costEstimate.estimatingEvaluatorIds}
          footerTrailing={total}
        />
      </EvalVariableSourceColumnsProvider>
      {costEstimate.status === "error" && assignments.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Cost estimates are temporarily unavailable.
        </p>
      ) : null}
    </Stepper>
  );
}
