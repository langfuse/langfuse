import { useStore } from "zustand";

import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";
import { EvaluatorAssignmentsEditor } from "@/src/features/evals/v2/components/Rules/EvaluatorAssignmentsEditor/EvaluatorAssignmentsEditor";
import { buildSelectedSampleObject } from "@/src/features/evals/v2/fns/evaluatorTesting/buildSelectedSampleObject";
import type {
  RuleEvaluatorOption,
  RuleSetupStore,
} from "@/src/features/evals/v2/types/rules";
import { api, sendAsPostOption } from "@/src/utils/api";

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
      />
    </Stepper>
  );
}
