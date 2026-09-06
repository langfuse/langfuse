import { useStore } from "zustand";

import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";
import { EvaluatorAssignmentsEditor } from "@/src/features/evals/v2/components/Rules/EvaluatorAssignmentsEditor/EvaluatorAssignmentsEditor";
import { buildSelectedSampleObject } from "@/src/features/evals/v2/fns/evaluatorTesting/buildSelectedSampleObject";
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
        selectedObservation?.id &&
        selectedObservation.traceId &&
        selectedObservation.startTime,
      ),
      select: (data) => data[0],
    },
  );
  const sampleObject = buildSelectedSampleObject({
    observation: selectedObservation,
    eventDetails: selectedObservationDetails.data,
  });
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
      description="Choose which evaluators should run on matching observations."
    >
      <EvaluatorAssignmentsEditor
        evaluatorOptions={evaluatorOptions}
        store={store}
        search={search}
        onSearchChange={onSearchChange}
        sampleObject={sampleObject}
        costEstimates={costEstimate.estimates}
        estimatingEvaluatorIds={costEstimate.estimatingEvaluatorIds}
        footerTrailing={total}
      />
      {costEstimate.status === "error" && assignments.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Cost estimates are temporarily unavailable.
        </p>
      ) : null}
    </Stepper>
  );
}
