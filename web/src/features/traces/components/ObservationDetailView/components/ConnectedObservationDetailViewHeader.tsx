import { memo, useMemo, useState } from "react";
import {
  AnnotationQueueObjectType,
  isGenerationLike,
  type ScoreDomain,
} from "@langfuse/shared";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { ExistingDatasetItemsDropdownMenuController } from "@/src/features/datasets/components/ExistingDatasetItemsDropdownMenuController";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets/components/NewDatasetItemFromExistingObjectDialogController";
import { useDatasetItemFromTraceOrObservation } from "@/src/features/datasets/hooks/useDatasetItemFromTraceOrObservation";
import { AnnotateDrawerController } from "@/src/features/scores/components/AnnotateDrawerController";
import { CommentDrawerController } from "@/src/features/comments/CommentDrawerController";
import { AnnotationQueueItemDropdownMenuController } from "@/src/features/annotation-queues/components/AnnotationQueueItemDropdownMenuController";
import { JumpToPlaygroundDropdownMenuController } from "@/src/features/playground/page/components/JumpToPlaygroundDropdownMenuController";
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
import {
  ObservationDetailViewHeader,
  ObservationHeaderDatasetButton,
  ObservationHeaderOptionsButton,
  ObservationHeaderPlaygroundButton,
  ObservationHeaderQueueButton,
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

    const traceScores = useMemo(
      () => serverScores.filter((score) => !score.observationId),
      [serverScores],
    );
    const hasAnnotationAccess = useHasProjectAccess({
      projectId,
      scope: "scores:CUD",
    });
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
                                menu: (
                                  <ExistingDatasetItemsDropdownMenuController
                                    projectId={projectId}
                                    datasetItems={existingDatasetItems}
                                    disabled={!hasDatasetAccess}
                                    onOpenDialog={openDialog}
                                  >
                                    {({ Anchor, openDropdown }) => (
                                      <Anchor>
                                        <ObservationHeaderDatasetButton
                                          variant={
                                            isMobile ? "mobile" : "desktop"
                                          }
                                          disabled={!hasDatasetAccess}
                                          datasetCount={datasetCount}
                                          onClick={openDropdown}
                                        />
                                      </Anchor>
                                    )}
                                  </ExistingDatasetItemsDropdownMenuController>
                                ),
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
                      annotationQueueMenu={
                        <AnnotationQueueItemDropdownMenuController
                          projectId={projectId}
                          objectId={observation.id}
                          objectType={AnnotationQueueObjectType.OBSERVATION}
                        >
                          {({ disabled, totalCount }) => (
                            <ObservationHeaderQueueButton
                              variant={isMobile ? "mobile" : "desktop"}
                              disabled={disabled !== undefined}
                              totalCount={totalCount}
                            />
                          )}
                        </AnnotationQueueItemDropdownMenuController>
                      }
                      playgroundMenu={
                        observationWithIO &&
                        isGenerationLike(observationWithIO.type) ? (
                          <JumpToPlaygroundDropdownMenuController
                            source="generation"
                            generation={observationWithIO}
                            analyticsEventName="trace_detail:test_in_playground_button_click"
                          >
                            {({ Trigger, disabled, title }) => (
                              <Trigger asChild>
                                <ObservationHeaderPlaygroundButton
                                  variant={isMobile ? "mobile" : "desktop"}
                                  disabled={disabled}
                                  title={title}
                                />
                              </Trigger>
                            )}
                          </JumpToPlaygroundDropdownMenuController>
                        ) : null
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
