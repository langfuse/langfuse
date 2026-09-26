import { AnnotationQueueObjectType, type Prisma } from "@langfuse/shared";
import { Database, PlusIcon, Terminal } from "lucide-react";
import { type ComponentProps, type ReactNode, useMemo } from "react";

import {
  DropdownMenu,
  type DropdownMenuItemDefinition,
} from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { AnnotationQueueSubmenuItemController } from "@/src/features/annotation-queues";
import { CreateDatasetDialogController } from "@/src/features/datasets/components/CreateDatasetDialogController";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets";
import {
  type JumpToPlaygroundSourceProps,
  useJumpToPlayground,
} from "@/src/features/playground/page/components/JumpToPlaygroundDropdownMenuController";
import { useHasProjectAccess } from "@/src/features/rbac";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { type AnalyticsData } from "@/src/features/scores/types";
import { api } from "@/src/utils/api";
import type { MetadataDomainClient } from "@/src/utils/clientSideDomainTypes";

type PlaygroundGeneration = Extract<
  JumpToPlaygroundSourceProps,
  { source: "generation" }
>["generation"];

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
  const objectId =
    props.variant === "observation" ? props.observationId : props.traceId;
  const objectType =
    props.variant === "observation"
      ? AnnotationQueueObjectType.OBSERVATION
      : AnnotationQueueObjectType.TRACE;

  return (
    <NewDatasetItemFromExistingObjectDialogController
      projectId={props.projectId}
    >
      {({ openDialog: openDatasetItemDialog }) => (
        <CreateDatasetDialogController
          projectId={props.projectId}
          target={{ type: "root" }}
        >
          {({
            disabled: createDatasetDisabled,
            openDialog: openDatasetDialog,
          }) => (
            <AnnotationQueueSubmenuItemController
              projectId={props.projectId}
              objectId={objectId}
              objectType={objectType}
              analyticsData={props.analyticsData}
            >
              {({ item: annotationQueueItem }) => (
                <ConnectedTraceObservationAddToDropdownMenuControllerContent
                  {...props}
                  annotationQueueItem={annotationQueueItem}
                  createDatasetDisabled={createDatasetDisabled}
                  openDatasetDialog={openDatasetDialog}
                  openDatasetItemDialog={openDatasetItemDialog}
                />
              )}
            </AnnotationQueueSubmenuItemController>
          )}
        </CreateDatasetDialogController>
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
  annotationQueueItem,
  createDatasetDisabled,
  openDatasetDialog,
  openDatasetItemDialog,
}: ConnectedTraceObservationAddToDropdownMenuControllerProps & {
  annotationQueueItem: DropdownMenuItemDefinition;
  createDatasetDisabled: { reason: string } | undefined;
  openDatasetDialog: () => void;
  openDatasetItemDialog: Parameters<
    ComponentProps<
      typeof NewDatasetItemFromExistingObjectDialogController
    >["children"]
  >[0]["openDialog"];
}) {
  const capture = usePostHogClientCapture();
  const datasets = api.datasets.allDatasetMeta.useQuery({ projectId });
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

  const items = useMemo(() => {
    const datasetItem: DropdownMenuItemDefinition = {
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
    };

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
    annotationQueueItem,
    capture,
    variant,
    createDatasetDisabled,
    datasets.data,
    datasets.isLoading,
    generation,
    hasDatasetAccess,
    input,
    includeOutput,
    metadata,
    observationId,
    openDatasetDialog,
    openDatasetItemDialog,
    output,
    handlePlaygroundAction,
    playgroundDisabled,
    playgroundTitle,
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
