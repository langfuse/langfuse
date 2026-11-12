import { useMemo } from "react";
import { useStore } from "zustand";
import { TRACE_TRANSCRIPT_EVAL_COLUMN } from "@langfuse/shared";

import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { api } from "@/src/utils/api";

/** The transcript of the selected sample's trace, keyed like the eval reads it. */
export function useEvaluatorTraceSample({
  projectId,
  store,
  enabled,
}: {
  projectId: string;
  store: EvaluatorSetupStore;
  enabled: boolean;
}) {
  const selectedObservation = useStore(
    store,
    (state) => state.selectedObservation,
  );
  const query = api.events.transcriptByTraceId.useQuery(
    {
      projectId,
      traceId: selectedObservation?.traceId ?? "",
      timestamp: selectedObservation?.startTime,
      context: "other",
    },
    { enabled: enabled && Boolean(selectedObservation?.traceId) },
  );
  const sourceObject = useMemo(
    () =>
      query.data?.transcript
        ? { [TRACE_TRANSCRIPT_EVAL_COLUMN]: query.data.transcript.threads }
        : null,
    [query.data],
  );

  return {
    sourceObject,
    cutoff: query.data?.cutoff ?? false,
    isPending: query.isPending && query.fetchStatus !== "idle",
    hasNoTranscript: query.isSuccess && !query.data.transcript,
    error: query.error?.message ?? null,
  };
}
