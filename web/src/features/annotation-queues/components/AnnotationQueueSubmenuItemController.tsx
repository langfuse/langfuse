import { type AnnotationQueueObjectType } from "@langfuse/shared";
import { ListPlus, PlusIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { type ReactNode, useCallback, useMemo } from "react";

import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { type DropdownMenuItemDefinition } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { AnnotationQueueFormDialogController } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogController";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useHasProjectAccess } from "@/src/features/rbac";
import { type AnalyticsData } from "@/src/features/scores/types";
import { api, reportNonTrpcError } from "@/src/utils/api";

type QueueRemoval = {
  itemId: string;
  queueName: string;
};

type AnnotationQueueSubmenuItemControllerProps = {
  projectId: string;
  objectId: string;
  objectType: AnnotationQueueObjectType;
  analyticsData: Pick<AnalyticsData, "source" | "isV4">;
  children: (control: {
    item: DropdownMenuItemDefinition;
    totalCount: number;
  }) => ReactNode;
};

const TARGET_TYPE_BY_OBJECT_TYPE = {
  TRACE: "trace",
  OBSERVATION: "observation",
  SESSION: "session",
} as const;

function getQueueAnalyticsContext(
  objectType: AnnotationQueueObjectType,
  analyticsData: Pick<AnalyticsData, "source" | "isV4">,
) {
  return {
    ...analyticsData,
    type: objectType === "SESSION" ? ("session" as const) : ("trace" as const),
    targetType: TARGET_TYPE_BY_OBJECT_TYPE[objectType],
    objectType,
    queueCount: 1,
  };
}

export function AnnotationQueueSubmenuItemController(
  props: AnnotationQueueSubmenuItemControllerProps,
) {
  const { projectId, objectId, objectType, analyticsData } = props;
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const removeFromQueueMutation =
    api.annotationQueueItems.deleteMany.useMutation();

  return (
    <AnnotationQueueFormDialogController
      projectId={projectId}
      mode="create"
      onSuccess={() => undefined}
    >
      {({ disabled: createQueueDisabled, openDialog: openQueueDialog }) => (
        <ConfirmationDialogController<QueueRemoval>
          title="Remove from annotation queue"
          text={({ queueName }) =>
            `Are you sure you want to remove this item from the queue "${queueName}"?`
          }
          confirmLabel="Remove"
          variant="destructive"
          loading={removeFromQueueMutation.isPending}
          error={removeFromQueueMutation.error?.message}
          onConfirm={async ({ itemId }) => {
            const result = await removeFromQueueMutation.mutateAsync({
              projectId,
              itemIds: [itemId],
            });
            if (result.deletedCount > 0) {
              capture(
                "annotation_queues:item_removed",
                getQueueAnalyticsContext(objectType, analyticsData),
              );
            }
            await utils.annotationQueues.byObjectId.invalidate({
              projectId,
              objectId,
              objectType,
            });
          }}
        >
          {({ openDialog: openRemoveQueueDialog }) => (
            <AnnotationQueueSubmenuItemControllerContent
              {...props}
              createQueueDisabled={createQueueDisabled}
              openQueueDialog={openQueueDialog}
              openRemoveQueueDialog={openRemoveQueueDialog}
            />
          )}
        </ConfirmationDialogController>
      )}
    </AnnotationQueueFormDialogController>
  );
}

function AnnotationQueueSubmenuItemControllerContent({
  projectId,
  objectId,
  objectType,
  analyticsData,
  children,
  createQueueDisabled,
  openQueueDialog,
  openRemoveQueueDialog,
}: AnnotationQueueSubmenuItemControllerProps & {
  createQueueDisabled: { reason: string } | undefined;
  openQueueDialog: () => void;
  openRemoveQueueDialog: (queueRemoval: QueueRemoval) => void;
}) {
  const capture = usePostHogClientCapture();
  const session = useSession();
  const queues = api.annotationQueues.byObjectId.useQuery(
    { projectId, objectId, objectType },
    {
      enabled:
        session.status === "authenticated" &&
        Boolean(projectId) &&
        Boolean(objectId),
    },
  );
  const utils = api.useUtils();
  const addToQueueMutation = api.annotationQueueItems.createMany.useMutation();
  const hasAnnotationQueueAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });

  const handleQueueItemToggle = useCallback(
    async (queueId: string, queueName: string, itemId?: string) => {
      try {
        if (!itemId) {
          const result = await addToQueueMutation.mutateAsync({
            projectId,
            objectIds: [objectId],
            objectType,
            queueId,
          });
          if (result.createdCount > 0) {
            capture(
              "annotation_queues:item_added",
              getQueueAnalyticsContext(objectType, analyticsData),
            );
          }
        } else {
          openRemoveQueueDialog({ itemId, queueName });
          return;
        }

        await utils.annotationQueues.byObjectId.invalidate({
          projectId,
          objectId,
          objectType,
        });
      } catch (error) {
        reportNonTrpcError(error, "annotation-queues");
      }
    },
    [
      addToQueueMutation,
      analyticsData,
      capture,
      objectId,
      objectType,
      openRemoveQueueDialog,
      projectId,
      utils.annotationQueues,
    ],
  );

  const queuesAreLoading =
    session.status !== "authenticated" || queues.isLoading;

  const item = useMemo<DropdownMenuItemDefinition>(
    () => ({
      type: "submenu",
      id: "annotation-queue",
      title: "Annotation queue",
      icon: ListPlus,
      search: { placeholder: "Search annotation queues…" },
      disabled:
        !hasAnnotationQueueAccess || queuesAreLoading
          ? {
              reason: !hasAnnotationQueueAccess
                ? "You don't have permission to add items to annotation queues."
                : "Annotation queues are loading.",
            }
          : undefined,
      items: queuesAreLoading
        ? [{ id: "queues-loading", type: "loading" }]
        : [
            ...(queues.data?.queues ?? []).map((queue) => ({
              type: "checkbox" as const,
              id: queue.id,
              title: queue.name,
              checked: Boolean(queue.itemId),
              closeOnCheckedChange: Boolean(queue.itemId),
              onCheckedChange: () => {
                handleQueueItemToggle(queue.id, queue.name, queue.itemId).catch(
                  () => undefined,
                );
              },
            })),
            ...((queues.data?.queues.length ?? 0) === 0
              ? [
                  {
                    id: "no-queues",
                    type: "item" as const,
                    title: "No queues defined",
                    disabled: {
                      reason: "No annotation queues are defined.",
                    },
                    onClick: () => undefined,
                  },
                ]
              : []),
            ...(createQueueDisabled === undefined
              ? [
                  {
                    id: "queues-separator",
                    type: "separator" as const,
                  },
                  {
                    id: "create-queue",
                    type: "item" as const,
                    title: "Create new queue",
                    icon: PlusIcon,
                    onClick: openQueueDialog,
                  },
                ]
              : []),
          ],
    }),
    [
      createQueueDisabled,
      handleQueueItemToggle,
      hasAnnotationQueueAccess,
      openQueueDialog,
      queues.data?.queues,
      queuesAreLoading,
    ],
  );

  return children({ item, totalCount: queues.data?.totalCount ?? 0 });
}
