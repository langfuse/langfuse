import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { type ActionId } from "@langfuse/shared";
import { api } from "@/src/utils/api";

export const useTableActionMutations = (
  actionIds: ActionId[],
  projectId: string,
) => {
  const utils = api.useUtils();

  // Base mutation that's always needed
  const selectAllMutation = api.table.selectAll.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Select all in progress",
        description: "Your action may take a few minutes to complete.",
        duration: 10000,
      });
    },
  });

  // Individual action mutations
  const traceDeleteMutation = api.traces.deleteMany.useMutation({
    onSuccess: () => {
      showSuccessToast({
        title: "Traces deleted",
        description: `Selected traces deleted.`,
      });
    },
    onSettled: () => {
      void utils.traces.all.invalidate();
    },
  });

  const traceAddToQueueMutation =
    api.annotationQueueItems.createMany.useMutation({
      onSuccess: (data) => {
        showSuccessToast({
          title: "Traces added to queue",
          description: `Selected traces added to queue "${data.queueName}".`,
          link: {
            href: `/project/${projectId}/annotation-queues/${data.queueId}`,
            text: `View queue "${data.queueName}"`,
          },
        });
      },
    });

  // Map of all possible mutations
  const actionMutations: Record<ActionId, any> = {
    "trace-delete": traceDeleteMutation,
    "trace-add-to-annotation-queue": traceAddToQueueMutation,
  } as const;

  return {
    selectAllMutation,
    actionMutations: Object.fromEntries(
      actionIds.map((id) => [id, actionMutations[id]]),
    ),
  };
};
