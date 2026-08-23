import { useMemo } from "react";
import { useStore } from "zustand";

import { buildSelectedSampleObject } from "@/src/features/evals/v2/fns/evaluatorTesting/buildSelectedSampleObject";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { api, sendAsPostOption } from "@/src/utils/api";

export function useEvaluatorSetupSample({
  projectId,
  store,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
}) {
  const selectedObservation = useStore(
    store,
    (state) => state.selectedObservation,
  );
  // We need `experimentBatchIO` as we want to include experiment events
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

  return useMemo(
    () =>
      buildSelectedSampleObject({
        observation: selectedObservation,
        eventDetails: selectedObservationDetails.data,
      }),
    [selectedObservation, selectedObservationDetails.data],
  );
}
