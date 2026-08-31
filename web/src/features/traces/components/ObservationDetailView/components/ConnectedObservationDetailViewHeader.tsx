import { memo, useCallback, useMemo, useState } from "react";
import {
  AnnotationQueueObjectType,
  isGenerationLike,
  supportedModels as playgroundSupportedModels,
  type ScoreDomain,
} from "@langfuse/shared";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets/components/NewDatasetItemFromExistingObjectDialogController";
import { useDatasetItemFromTraceOrObservation } from "@/src/features/datasets/hooks/useDatasetItemFromTraceOrObservation";
import { AnnotateDrawerController } from "@/src/features/scores/components/AnnotateDrawerController";
import { CommentDrawerController } from "@/src/features/comments/CommentDrawerController";
import { type AnnotationQueueItemMenuQueue } from "@/src/features/annotation-queues/components/AnnotationQueueItemMenuContent";
import { parseGeneration } from "@/src/features/playground/page/components/JumpToPlaygroundDropdownMenuController";
import {
  type WithStringifiedMetadata,
  type MetadataDomainClient,
} from "@/src/utils/clientSideDomainTypes";
import { type AggregatedTraceMetrics } from "@/src/features/traces/fns/traceAggregation";
import type Decimal from "decimal.js";
import { DetailHeaderActionsMenuController } from "@/src/features/traces/components/DetailHeaderActionsMenuController";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { Drawer, DrawerContent } from "@/src/components/ui/drawer";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { DualAnnotationContent } from "@/src/features/scores/components/DualAnnotationContent";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { useSession } from "next-auth/react";
import { api, reportNonTrpcError } from "@/src/utils/api";
import { useRouter } from "next/router";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { usePersistedWindowIds } from "@/src/features/playground/page/hooks/usePersistedWindowIds";
import usePlaygroundCache from "@/src/features/playground/page/hooks/usePlaygroundCache";
import { type JumpToPlaygroundAction } from "@/src/features/playground/page/components/JumpToPlaygroundMenu";
import {
  ObservationDetailViewHeader,
  ObservationHeaderOptionsButton,
} from "./ObservationDetailViewHeader";

export interface ConnectedObservationDetailViewHeaderProps {
  observation: ObservationReturnTypeWithMetadata;
  observationWithIO:
    | (Omit<ObservationReturnTypeWithMetadata, "traceId" | "metadata"> & {
        traceId: string | null;
        input: string | null;
        output: string | null;
        metadata: MetadataDomainClient;
      })
    | undefined;
  projectId: string;
  traceId: string;
  latencySeconds: number | null;
  observationScores: WithStringifiedMetadata<ScoreDomain>[];
  commentCount: number | undefined;
  pendingSelection?: SelectionData | null;
  onSelectionUsed?: () => void;
  isCommentDrawerOpen?: boolean;
  onCommentDrawerOpenChange?: (open: boolean) => void;
  subtreeMetrics?: AggregatedTraceMetrics | null;
  treeNodeTotalCost?: Decimal;
}

export const ConnectedObservationDetailViewHeader = memo(
  function ConnectedObservationDetailViewHeader({
    observation,
    observationWithIO,
    projectId,
    traceId,
    latencySeconds,
    observationScores,
    commentCount,
    pendingSelection,
    onSelectionUsed,
    isCommentDrawerOpen,
    onCommentDrawerOpenChange,
    subtreeMetrics,
    treeNodeTotalCost,
  }: ConnectedObservationDetailViewHeaderProps) {
    const { isAnnotationMode } = useViewPreferences();
    const isMobile = useIsMobile();
    const { isBetaEnabled: isV4Enabled } = useV4Beta();
    const { trace, serverScores } = useTraceData();
    const [isV4AnnotationDrawerOpen, setIsV4AnnotationDrawerOpen] =
      useState(false);
    const [includePlaygroundOutput, setIncludePlaygroundOutput] =
      useState(false);
    const router = useRouter();
    const capture = usePostHogClientCapture();
    const { addWindowWithId, clearAllCache } = usePersistedWindowIds();
    const playgroundWindowId = `playground-generation-${observation.id}`;
    const { setPlaygroundCache } = usePlaygroundCache(playgroundWindowId);

    const traceScores = useMemo(
      () => serverScores.filter((score) => !score.observationId),
      [serverScores],
    );
    const hasAnnotationAccess = useHasProjectAccess({
      projectId,
      scope: "scores:CUD",
    });
    const session = useSession();
    const hasAnnotationQueueAccess = useHasProjectAccess({
      projectId,
      scope: "annotationQueues:CUD",
    });
    const annotationQueues = api.annotationQueues.byObjectId.useQuery(
      {
        projectId,
        objectId: observation.id,
        objectType: AnnotationQueueObjectType.OBSERVATION,
      },
      {
        enabled:
          session.status === "authenticated" &&
          Boolean(projectId) &&
          Boolean(observation.id),
      },
    );
    const utils = api.useUtils();
    const addToQueueMutation =
      api.annotationQueueItems.createMany.useMutation();
    const removeFromQueueMutation =
      api.annotationQueueItems.deleteMany.useMutation();
    const handleQueueItemToggle = useCallback(
      async (queueId: string, queueName: string, itemId?: string) => {
        try {
          if (!itemId) {
            await addToQueueMutation.mutateAsync({
              projectId,
              objectIds: [observation.id],
              objectType: AnnotationQueueObjectType.OBSERVATION,
              queueId,
            });
          } else if (
            confirm(
              `Are you sure you want to remove this item from the queue "${queueName}"?`,
            )
          ) {
            await removeFromQueueMutation.mutateAsync({
              projectId,
              itemIds: [itemId],
            });
          }

          await utils.annotationQueues.byObjectId.invalidate({
            projectId,
            objectId: observation.id,
            objectType: AnnotationQueueObjectType.OBSERVATION,
          });
        } catch (error) {
          reportNonTrpcError(error, "annotation-queues");
        }
      },
      [
        addToQueueMutation,
        observation.id,
        projectId,
        removeFromQueueMutation,
        utils.annotationQueues,
      ],
    );
    const areAnnotationQueuesLoading =
      session.status !== "authenticated" || annotationQueues.isLoading;
    const {
      existingDatasetItems,
      hasAccess: hasDatasetAccess,
      captureNewDatasetItemFormOpen,
    } = useDatasetItemFromTraceOrObservation({
      projectId,
      traceId,
      observationId: observation.id,
      enabled: Boolean(observationWithIO),
    });
    const datasetCount = existingDatasetItems.length;
    const playgroundApiKeys = api.llmApiKey.all.useQuery(
      { projectId },
      { enabled: Boolean(projectId) },
    );
    const playgroundModelToProviderMap = useMemo(() => {
      const modelProviderMap: Record<string, string> = {};

      (playgroundApiKeys.data?.data ?? []).forEach(
        ({ provider, customModels, withDefaultModels, adapter }) => {
          if (withDefaultModels) {
            (playgroundSupportedModels[adapter] ?? []).forEach((model) => {
              modelProviderMap[model] = provider;
            });
          }
          customModels.forEach((customModel) => {
            modelProviderMap[customModel] = provider;
          });
        },
      );
      return modelProviderMap;
    }, [playgroundApiKeys.data]);
    const playgroundState = useMemo(
      () =>
        observationWithIO
          ? parseGeneration(
              observationWithIO,
              playgroundModelToProviderMap,
              includePlaygroundOutput,
            )
          : null,
      [
        includePlaygroundOutput,
        observationWithIO,
        playgroundModelToProviderMap,
      ],
    );
    const handlePlaygroundAction = (action: JumpToPlaygroundAction) => {
      const useFreshPlayground = action === "fresh";
      capture("trace_detail:test_in_playground_button_click", {
        playgroundMode: useFreshPlayground ? "fresh" : "add_to_existing",
      });
      if (!playgroundState) return;

      if (useFreshPlayground) {
        clearAllCache(playgroundWindowId);
      } else if (!addWindowWithId(playgroundWindowId)) {
        return;
      }
      requestAnimationFrame(() => {
        try {
          setPlaygroundCache(playgroundState);
        } finally {
          router.push(`/project/${projectId}/playground`);
        }
      });
    };

    const optionsAction = (
      <DetailHeaderActionsMenuController
        idItems={[
          { id: traceId, name: "Trace ID" },
          { id: observation.id, name: "Observation ID" },
        ]}
        observationType={observation.type}
        projectId={projectId}
        spanName={observation.name ?? ""}
        webCallout={{
          traceId,
          observationId: observation.id,
          sessionId: observation.sessionId ?? null,
        }}
      >
        {({ Trigger }) => (
          <Trigger asChild>
            <ObservationHeaderOptionsButton />
          </Trigger>
        )}
      </DetailHeaderActionsMenuController>
    );

    return (
      <NewDatasetItemFromExistingObjectDialogController
        traceId={traceId}
        observationId={observation.id}
        projectId={projectId}
        input={observationWithIO?.input ?? null}
        output={observationWithIO?.output ?? null}
        metadata={observationWithIO?.metadata ?? {}}
      >
        {({ openDialog }) => (
          <AnnotateDrawerController
            projectId={projectId}
            scoreTarget={{
              type: "trace",
              traceId,
              observationId: observation.id,
            }}
            scores={observationScores}
            scoreMetadata={{
              projectId,
              environment: observation.environment,
            }}
          >
            {({ disabled: annotationDisabled, openDrawer }) => (
              <CommentDrawerController
                projectId={projectId}
                objectId={observation.id}
                objectType="OBSERVATION"
                count={commentCount}
                pendingSelection={pendingSelection}
                onSelectionUsed={onSelectionUsed}
                isOpen={isCommentDrawerOpen}
                onOpenChange={onCommentDrawerOpenChange}
              >
                {({ disabled: commentDisabled, openDrawer: openComments }) => (
                  <>
                    {isV4Enabled ? (
                      <Drawer
                        open={isV4AnnotationDrawerOpen}
                        onOpenChange={setIsV4AnnotationDrawerOpen}
                      >
                        <DrawerContent className="p-3">
                          <DualAnnotationContent
                            projectId={projectId}
                            traceId={traceId}
                            observationId={observation.id}
                            traceEnvironment={trace.environment}
                            observationEnvironment={observation.environment}
                            observationScores={observationScores}
                            traceScores={traceScores}
                          />
                        </DrawerContent>
                      </Drawer>
                    ) : null}
                    <ObservationDetailViewHeader
                      observation={observation}
                      projectId={projectId}
                      latencySeconds={latencySeconds}
                      subtreeMetrics={subtreeMetrics}
                      treeNodeTotalCost={treeNodeTotalCost}
                      isAnnotationMode={isAnnotationMode}
                      isMobile={isMobile}
                      optionsMenu={optionsAction}
                      datasetAction={
                        !observationWithIO
                          ? { type: "hidden" }
                          : datasetCount === 0
                            ? {
                                type: "dialog",
                                disabled: !hasDatasetAccess,
                                onClick: () => {
                                  captureNewDatasetItemFormOpen();
                                  openDialog();
                                },
                              }
                            : {
                                type: "menu",
                                disabled: !hasDatasetAccess,
                                datasetItems: existingDatasetItems,
                                onOpenDialog: openDialog,
                              }
                      }
                      annotationAction={{
                        disabled: isV4Enabled
                          ? !hasAnnotationAccess
                          : annotationDisabled,
                        onClick: isV4Enabled
                          ? () => {
                              if (hasAnnotationAccess) {
                                setIsV4AnnotationDrawerOpen(true);
                              }
                            }
                          : openDrawer,
                      }}
                      annotationQueueAction={{
                        disabled:
                          !hasAnnotationQueueAccess ||
                          areAnnotationQueuesLoading,
                        totalCount: annotationQueues.data?.totalCount ?? 0,
                        queues: (annotationQueues.data?.queues ??
                          []) satisfies AnnotationQueueItemMenuQueue[],
                        onQueueItemToggle: handleQueueItemToggle,
                      }}
                      playgroundAction={
                        observationWithIO &&
                        isGenerationLike(observationWithIO.type)
                          ? {
                              disabled: !playgroundState,
                              title: playgroundState
                                ? "Test in LLM playground"
                                : "Test in LLM playground is not available since messages are not in valid ChatML format or tool calls have been used. If you think this is not correct, please open a GitHub issue.",
                              includeOutput: includePlaygroundOutput,
                              onIncludeOutputChange: setIncludePlaygroundOutput,
                              onPlaygroundAction: handlePlaygroundAction,
                            }
                          : { type: "hidden" }
                      }
                      commentAction={{
                        disabled: commentDisabled,
                        count: commentCount,
                        onClick: openComments,
                      }}
                    />
                  </>
                )}
              </CommentDrawerController>
            )}
          </AnnotateDrawerController>
        )}
      </NewDatasetItemFromExistingObjectDialogController>
    );
  },
);
