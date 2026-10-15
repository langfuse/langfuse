import { useRef } from "react";
import { type TopicBackfillSource } from "@langfuse/shared/topics";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";

type BackfillValues = { source: TopicBackfillSource; limit: number };

/**
 * Schedules a Topics backfill. Call it from a component that stays mounted
 * while the dialog opens and closes: a pending request then survives a close,
 * and a retry of the same values reuses its idempotency key.
 */
export function useTopicBackfill(projectId: string) {
  const request = useRef<{ key: string; id: string } | null>(null);
  const mutation = api.topics.backfill.useMutation();

  function schedule(values: BackfillValues, onScheduled: () => void) {
    const key = JSON.stringify(values);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    mutation.mutate(
      { projectId, ...values, requestId: request.current.id },
      {
        onSuccess: ({ traceCount }) => {
          request.current = null;
          if (traceCount === 0) return;
          showSuccessToast({
            operation: "topics.backfill",
            title: "Backfill scheduled",
            description: `${traceCountLabel(traceCount)} queued. Summaries appear once their batches finish.`,
          });
          onScheduled();
        },
      },
    );
  }
  function resetResult() {
    if (!mutation.isPending) mutation.reset();
  }

  return {
    schedule,
    resetResult,
    isPending: mutation.isPending,
    error: mutation.error?.message ?? null,
    matchedNothing: mutation.data?.traceCount === 0,
  };
}

export type TopicBackfill = ReturnType<typeof useTopicBackfill>;

function traceCountLabel(count: number) {
  if (count === 1) return "1 trace";
  return `${count} traces`;
}
