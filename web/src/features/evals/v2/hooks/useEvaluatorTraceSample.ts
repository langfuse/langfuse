import { useMemo } from "react";
import { useStore, type StoreApi } from "zustand";
import {
  TRACE_TRANSCRIPT_EVAL_COLUMN,
  toEvalVariables,
} from "@langfuse/shared";

import type { SampleObservation } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { api } from "@/src/utils/api";

/** The transcript of one sample's trace, keyed like the eval reads it. */
export function useTraceSampleTranscript({
  projectId,
  sample,
  enabled,
}: {
  projectId: string;
  sample: SampleObservation | null;
  enabled: boolean;
}) {
  const query = api.events.transcriptByTraceId.useQuery(
    {
      projectId,
      traceId: sample?.traceId ?? "",
      timestamp: sample?.startTime,
      context: "other",
    },
    { enabled: enabled && Boolean(sample?.traceId) },
  );
  const sourceObject = useMemo(
    () =>
      query.data?.transcript
        ? {
            [TRACE_TRANSCRIPT_EVAL_COLUMN]: toEvalVariables(
              query.data.transcript.threads,
            ),
          }
        : null,
    [query.data],
  );
  const hasMessages = (query.data?.transcript?.threads ?? []).some(
    (thread) =>
      (thread.conversationHistory?.length ?? 0) > 0 ||
      thread.currentTurn.messages.length > 0,
  );

  return {
    sourceObject,
    cutoff: query.data?.cutoff ?? false,
    isPending: query.isPending && query.fetchStatus !== "idle",
    hasNoMessages: query.isSuccess && !hasMessages,
    error: query.error?.message ?? null,
  };
}

/** The transcript of the store's selected sample. */
export function useEvaluatorTraceSample({
  projectId,
  store,
  enabled,
}: {
  projectId: string;
  store: StoreApi<{ selectedObservation: SampleObservation | null }>;
  enabled: boolean;
}) {
  const selectedObservation = useStore(
    store,
    (state) => state.selectedObservation,
  );
  return useTraceSampleTranscript({
    projectId,
    sample: selectedObservation,
    enabled,
  });
}
