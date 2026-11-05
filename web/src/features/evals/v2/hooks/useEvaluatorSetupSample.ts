import { useMemo } from "react";
import { useStore } from "zustand";

import { buildSelectedSampleObject } from "@/src/features/evals/v2/fns/evaluatorTesting/buildSelectedSampleObject";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { api, sendAsPostOption } from "@/src/utils/api";

const SELECT_TRACE_MESSAGE = "Select a sample trace.";
const NO_TRANSCRIPT_MESSAGE = "This trace has no transcript.";
const INCOMPLETE_TRANSCRIPT_MESSAGE = "The transcript is incomplete.";

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
  const sampleScope = useStore(store, (state) => state.sampleScope);
  const evaluatorType = useStore(store, (state) => state.type);
  const useThreads = sampleScope === "trace" && evaluatorType !== "CODE";
  const observationEnabled = Boolean(
    !useThreads &&
    selectedObservation?.id &&
    selectedObservation.traceId &&
    selectedObservation.startTime,
  );
  const transcriptEnabled = Boolean(
    useThreads && selectedObservation?.traceId && selectedObservation.startTime,
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
      enabled: observationEnabled,
      select: (data) => data[0],
    },
  );
  const transcript = api.events.transcriptByTraceId.useQuery(
    {
      projectId,
      traceId: selectedObservation?.traceId ?? "",
      timestamp: selectedObservation?.startTime,
      context: "other",
    },
    { enabled: transcriptEnabled },
  );

  return useMemo(() => {
    if (!useThreads) {
      return {
        sample: buildSelectedSampleObject({
          observation: selectedObservation,
          eventDetails: observationEnabled
            ? selectedObservationDetails.data
            : null,
        }),
        notice: null as string | null,
      };
    }
    if (!transcriptEnabled) {
      return { sample: null, notice: SELECT_TRACE_MESSAGE };
    }
    if (transcript.isPending) {
      return { sample: null, notice: null };
    }
    if (transcript.isError) {
      return { sample: null, notice: transcript.error.message };
    }
    const loaded = transcript.data?.transcript;
    if (!loaded) {
      return { sample: null, notice: NO_TRANSCRIPT_MESSAGE };
    }
    return {
      sample: { threads: loaded.threads },
      notice:
        transcript.data?.cutoff || loaded.truncated
          ? INCOMPLETE_TRANSCRIPT_MESSAGE
          : null,
    };
  }, [
    observationEnabled,
    selectedObservation,
    selectedObservationDetails.data,
    transcript.data,
    transcript.error?.message,
    transcript.isError,
    transcript.isPending,
    transcriptEnabled,
    useThreads,
  ]);
}
