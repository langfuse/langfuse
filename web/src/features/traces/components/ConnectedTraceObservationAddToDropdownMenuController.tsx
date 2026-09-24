import { AnnotationQueueObjectType, type Prisma } from "@langfuse/shared";
import { Database, ListPlus, PlusIcon, Terminal } from "lucide-react";
import { useSession } from "next-auth/react";
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useMemo,
} from "react";

import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";
import { AnnotationQueueFormDialogController } from "@/src/features/annotation-queues/components/AnnotationQueueFormDialogController";
import { CreateDatasetDialogController } from "@/src/features/datasets/components/CreateDatasetDialogController";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets";
import {
  type JumpToPlaygroundSourceProps,
  useJumpToPlayground,
} from "@/src/features/playground/page/components/JumpToPlaygroundDropdownMenuController";
import { useHasProjectAccess } from "@/src/features/rbac";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { type AnalyticsData } from "@/src/features/scores/types";
import { api, reportNonTrpcError } from "@/src/utils/api";
import type { MetadataDomainClient } from "@/src/utils/clientSideDomainTypes";

type PlaygroundGeneration = Extract<
  JumpToPlaygroundSourceProps,
  { source: "generation" }
>["generation"];

type QueueRemoval = {
  itemId: string;
  queueName: string;
};

type MenuPresentation =
  | {
      children: ComponentProps<typeof DropdownMenu>["children"];
      renderMenu?: never;
    }
  | {
      children?: never;
      renderMenu: (items: DropdownMenuItemDefinition[]) => ReactNode;
    };

type ConnectedTraceObservationAddToDropdownMenuControllerProps =
  MenuPresentation & {
    projectId: string;
    input: Prisma.JsonValue | null;
    output: Prisma.JsonValue | null;
    metadata: MetadataDomainClient;
    analyticsData: Pick<AnalyticsData, "source" | "isV4">;
  } & (
      | {
          variant: "trace";
          traceId: string;
          observationId?: never;
          generation?: never;
        }
      | {
          variant: "observation";
          traceId: string;
          observationId: string;
          generation?: PlaygroundGeneration;
        }
    );

export function ConnectedTraceObservationAddToDropdownMenuController(
  props: ConnectedTraceObservationAddToDropdownMenuControllerProps,
) {
  const capture = usePostHogClientCapture();
  const objectId =
    props.variant === "observation" ? props.observationId : props.traceId;
  const objectType =
    props.variant === "observation"
      ? AnnotationQueueObjectType.OBSERVATION
      : AnnotationQueueObjectType.TRACE;
  const utils = api.useUtils();
  const removeFromQueueMutation =
    api.annotationQueueItems.deleteMany.useMutation();

  return (
    <NewDatasetItemFromExistingObjectDialogController
      projectId={props.projectId}
    >
      {({ openDialog: openDatasetItemDialog }) => (
        <AnnotationQueueFormDialogController
          projectId={props.projectId}
          mode="create"
          onSuccess={() => undefined}
        >
          {({ disabled: createQueueDisabled, openDialog: openQueueDialog }) => (
            <CreateDatasetDialogController
              projectId={props.projectId}
              target={{ type: "root" }}
            >
              {({
                disabled: createDatasetDisabled,
                openDialog: openDatasetDialog,
              }) => (
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
                      projectId: props.projectId,
                      itemIds: [itemId],
                    });
                    if (result.deletedCount > 0) {
                      capture("annotation_queues:item_removed", {
                        ...props.analyticsData,
                        type: "trace",
                        targetType: props.variant,
                        objectType,
                        queueCount: 1,
                      });
                    }
                    await utils.annotationQueues.byObjectId.invalidate({
                      projectId: props.projectId,
                      objectId,
                      objectType,
                    });
                  }}
                >
                  {({ openDialog: openRemoveQueueDialog }) => (
                    <ConnectedTraceObservationAddToDropdownMenuControllerContent
                      {...props}
                      createDatasetDisabled={createDatasetDisabled}
                      createQueueDisabled={createQueueDisabled}
                      openDatasetDialog={openDatasetDialog}
                      openDatasetItemDialog={openDatasetItemDialog}
                      openQueueDialog={openQueueDialog}
                      openRemoveQueueDialog={openRemoveQueueDialog}
                    />
                  )}
                </ConfirmationDialogController>
              )}
            </CreateDatasetDialogController>
          )}
        </AnnotationQueueFormDialogController>
      )}
    </NewDatasetItemFromExistingObjectDialogController>
  );
}

function ConnectedTraceObservationAddToDropdownMenuControllerContent({
  projectId,
  variant,
  traceId,
  observationId,
  input,
  output,
  metadata,
  analyticsData,
  generation,
  children,
  renderMenu,
  createDatasetDisabled,
  createQueueDisabled,
  openDatasetDialog,
  openDatasetItemDialog,
  openQueueDialog,
  openRemoveQueueDialog,
}: ConnectedTraceObservationAddToDropdownMenuControllerProps & {
  createDatasetDisabled: { reason: string } | undefined;
  createQueueDisabled: { reason: string } | undefined;
  openDatasetDialog: () => void;
  openDatasetItemDialog: Parameters<
    ComponentProps<
      typeof NewDatasetItemFromExistingObjectDialogController
    >["children"]
  >[0]["openDialog"];
  openQueueDialog: () => void;
  openRemoveQueueDialog: (queueRemoval: QueueRemoval) => void;
}) {
  const capture = usePostHogClientCapture();
  const session = useSession();
  const objectId = variant === "observation" ? observationId : traceId;
  const objectType =
    variant === "observation"
      ? AnnotationQueueObjectType.OBSERVATION
      : AnnotationQueueObjectType.TRACE;
  const queues = api.annotationQueues.byObjectId.useQuery(
    { projectId, objectId, objectType },
    {
      enabled:
        session.status === "authenticated" &&
        Boolean(projectId) &&
        Boolean(objectId),
    },
  );
  const datasets = api.datasets.allDatasetMeta.useQuery({ projectId });
  const utils = api.useUtils();
  const addToQueueMutation = api.annotationQueueItems.createMany.useMutation();
  const hasAnnotationQueueAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const hasDatasetAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });
  const playground = useJumpToPlayground({
    source: "generation",
    generation: generation ?? null,
    analyticsEventName: "trace_detail:test_in_playground_button_click",
  });
  const {
    disabled: playgroundDisabled,
    handlePlaygroundAction,
    includeOutput,
    setIncludeOutput,
    title: playgroundTitle,
  } = playground;

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
            capture("annotation_queues:item_added", {
              ...analyticsData,
              type: "trace",
              targetType: variant,
              objectType,
              queueCount: 1,
            });
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
      variant,
    ],
  );

  const queuesAreLoading =
    session.status !== "authenticated" || queues.isLoading;

  const items = useMemo(() => {
    const [annotationQueueItem, datasetItem]: [
      DropdownMenuItemDefinition,
      DropdownMenuItemDefinition,
    ] = [
      {
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
                  handleQueueItemToggle(
                    queue.id,
                    queue.name,
                    queue.itemId,
                  ).catch(() => undefined);
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
      },
      {
        type: "submenu",
        id: "dataset",
        title: "Dataset",
        icon: Database,
        search: { placeholder: "Search datasets…" },
        disabled: !hasDatasetAccess
          ? {
              reason: "You don't have permission to add items to datasets.",
            }
          : undefined,
        items: datasets.isLoading
          ? [{ id: "datasets-loading", type: "loading" }]
          : [
              ...(datasets.data ?? []).map((dataset) => ({
                type: "item" as const,
                id: dataset.id,
                title: dataset.name,
                onClick: () => {
                  capture("dataset_item:new_from_trace_form_open", {
                    object: variant,
                    ...analyticsData,
                  });
                  openDatasetItemDialog({
                    traceId,
                    observationId,
                    input,
                    output,
                    metadata,
                    datasetId: dataset.id,
                  });
                },
              })),
              ...((datasets.data?.length ?? 0) === 0
                ? [
                    {
                      id: "no-datasets",
                      type: "item" as const,
                      title: "No datasets defined",
                      disabled: {
                        reason: "No datasets are defined.",
                      },
                      onClick: () => undefined,
                    },
                  ]
                : []),
              {
                id: "datasets-separator",
                type: "separator" as const,
              },
              {
                type: "item" as const,
                id: "create-dataset",
                title: "Create new dataset",
                icon: PlusIcon,
                disabled: createDatasetDisabled,
                onClick: openDatasetDialog,
              },
            ],
      },
    ];

    const items = [datasetItem, annotationQueueItem];

    if (generation) {
      items.push({
        type: "submenu",
        id: "playground",
        title: "Playground",
        icon: Terminal,
        disabled: playgroundDisabled ? { reason: playgroundTitle } : undefined,
        items: [
          {
            type: "item",
            id: "fresh-playground",
            title: "Fresh playground",
            onClick: () => handlePlaygroundAction("fresh"),
          },
          {
            type: "item",
            id: "existing-playground",
            title: "Add to existing",
            onClick: () => handlePlaygroundAction("existing"),
          },
          {
            type: "separator",
            id: "playground-separator",
          },
          {
            type: "checkbox",
            id: "include-output",
            title: "Include output",
            checked: includeOutput,
            onCheckedChange: setIncludeOutput,
          },
        ],
      });
    }

    return items;
  }, [
    analyticsData,
    capture,
    variant,
    createDatasetDisabled,
    createQueueDisabled,
    datasets.data,
    datasets.isLoading,
    generation,
    handleQueueItemToggle,
    hasAnnotationQueueAccess,
    hasDatasetAccess,
    input,
    includeOutput,
    metadata,
    observationId,
    openDatasetDialog,
    openDatasetItemDialog,
    openQueueDialog,
    output,
    handlePlaygroundAction,
    playgroundDisabled,
    playgroundTitle,
    queues.data?.queues,
    queuesAreLoading,
    setIncludeOutput,
    traceId,
  ]);

  if (renderMenu) return renderMenu(items);

  return (
    <DropdownMenu items={items} maxHeight="24rem" placement="bottom-start">
      {children}
    </DropdownMenu>
  );
}
