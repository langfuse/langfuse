import { type TopicBackfillSource } from "@langfuse/shared/topics";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";

/**
 * Schedules a Topics backfill. A scheduled backfill is confirmed with a toast
 * and calls `onScheduled`; an empty selection is returned for the dialog to show.
 */
export function useTopicBackfill({
  projectId,
  onScheduled,
}: {
  projectId: string;
  onScheduled: () => void;
}) {
  const mutation = api.topics.backfill.useMutation({
    onSuccess: ({ traceCount }) => {
      if (traceCount === 0) return;
      showSuccessToast({
        operation: "topics.backfill",
        title: "Backfill scheduled",
        description: `${traceCountLabel(traceCount)} queued. Summaries appear once their batches finish.`,
      });
      onScheduled();
    },
  });
  function schedule(input: { source: TopicBackfillSource; limit: number }) {
    mutation.mutate({ projectId, ...input });
  }
  return {
    schedule,
    isPending: mutation.isPending,
    error: mutation.error?.message ?? null,
    matchedNothing: mutation.data?.traceCount === 0,
  };
}

function traceCountLabel(count: number) {
  if (count === 1) return "1 trace";
  return `${count} traces`;
}
