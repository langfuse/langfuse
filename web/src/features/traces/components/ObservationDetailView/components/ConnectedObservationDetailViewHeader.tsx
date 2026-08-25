import { memo, useMemo } from "react";
import {
  AnnotationQueueObjectType,
  isGenerationLike,
  type ScoreDomain,
} from "@langfuse/shared";
import type Decimal from "decimal.js";
import { LockIcon, SquarePen } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { JumpToPlaygroundButton } from "@/src/features/playground/page/components/JumpToPlaygroundButton";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { DualAnnotationContent } from "@/src/features/scores/components/DualAnnotationContent";
import { DetailHeaderActionsMenu } from "@/src/features/traces/components/DetailHeaderActionsMenu";
import { type AggregatedTraceMetrics } from "@/src/features/traces/fns/traceAggregation";
import { PromptBadge } from "@/src/features/traces/components/PromptBadge";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import {
  type MetadataDomainClient,
  type WithStringifiedMetadata,
} from "@/src/utils/clientSideDomainTypes";
import {
  EnvironmentBadge,
  LatencyBadge,
  LevelBadge,
  ReleaseBadge,
  TimeToFirstTokenBadge,
  VersionBadge,
} from "../../ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import { CostBadge, UsageBadge } from "../../ObservationMetadataBadgesTooltip";
import { SessionBadge, UserIdBadge } from "../../TraceMetadataBadges";
import { ModelBadge } from "./ModelBadge";
import { ModelParametersBadges } from "./ModelParametersBadges";
import { ObservationDetailViewHeader } from "./ObservationDetailViewHeader";

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
    const { isBetaEnabled: isV4Enabled } = useV4Beta();
    const { trace, serverScores } = useTraceData();
    const traceScores = useMemo(
      () => serverScores.filter((score) => !score.observationId),
      [serverScores],
    );
    const hasAnnotationAccess = useHasProjectAccess({
      projectId,
      scope: "scores:CUD",
    });

    const annotationContent = (
      <DualAnnotationContent
        projectId={projectId}
        traceId={traceId}
        observationId={observation.id}
        traceEnvironment={trace.environment}
        observationEnvironment={observation.environment}
        observationScores={observationScores}
        traceScores={traceScores}
      />
    );

    return (
      <ObservationDetailViewHeader
        observationType={observation.type}
        title={observation.name || observation.id}
        startTime={observation.startTime}
        titleActions={
          <DetailHeaderActionsMenu
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
          />
        }
        mobileMenuActions={
          <>
            {observationWithIO ? (
              <NewDatasetItemFromExistingObject
                traceId={traceId}
                observationId={observation.id}
                projectId={projectId}
                input={observationWithIO.input}
                output={observationWithIO.output}
                metadata={observationWithIO.metadata}
                layout="menu"
              />
            ) : null}
            {!isAnnotationMode ? (
              <>
                {isV4Enabled ? (
                  <Drawer key={`annotation-drawer-menu-${observation.id}`}>
                    <DrawerTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!hasAnnotationAccess}
                        className="w-full justify-start gap-2 font-normal"
                      >
                        {!hasAnnotationAccess ? (
                          <LockIcon className="h-3 w-3" />
                        ) : (
                          <SquarePen className="h-4 w-4" />
                        )}
                        <span className="text-sm">Annotate</span>
                      </Button>
                    </DrawerTrigger>
                    <DrawerContent className="p-3">
                      {annotationContent}
                    </DrawerContent>
                  </Drawer>
                ) : (
                  <AnnotateDrawer
                    key={`annotation-drawer-menu-${observation.id}`}
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
                    layout="menu"
                  />
                )}
                <CreateNewAnnotationQueueItem
                  projectId={projectId}
                  objectId={observation.id}
                  objectType={AnnotationQueueObjectType.OBSERVATION}
                  layout="menu"
                />
              </>
            ) : null}
            {observationWithIO && isGenerationLike(observationWithIO.type) ? (
              <JumpToPlaygroundButton
                source="generation"
                generation={observationWithIO}
                analyticsEventName="trace_detail:test_in_playground_button_click"
                layout="menu"
              />
            ) : null}
            <CommentDrawerButton
              projectId={projectId}
              objectId={observation.id}
              objectType="OBSERVATION"
              count={commentCount}
              layout="menu"
              pendingSelection={pendingSelection}
              onSelectionUsed={onSelectionUsed}
              isOpen={isCommentDrawerOpen}
              onOpenChange={onCommentDrawerOpenChange}
            />
          </>
        }
        toolbarActions={
          <>
            {observationWithIO ? (
              <NewDatasetItemFromExistingObject
                key={observation.id}
                traceId={traceId}
                observationId={observation.id}
                projectId={projectId}
                input={observationWithIO.input}
                output={observationWithIO.output}
                metadata={observationWithIO.metadata}
                size="sm"
              />
            ) : null}
            {!isAnnotationMode ? (
              <div className="flex items-start">
                {isV4Enabled ? (
                  <Drawer key={`annotation-drawer-${observation.id}`}>
                    <DrawerTrigger asChild>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!hasAnnotationAccess}
                        className="rounded-r-none"
                      >
                        {!hasAnnotationAccess ? (
                          <LockIcon className="mr-1.5 h-3 w-3" />
                        ) : (
                          <SquarePen className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        <span>Annotate</span>
                      </Button>
                    </DrawerTrigger>
                    <DrawerContent className="p-3">
                      {annotationContent}
                    </DrawerContent>
                  </Drawer>
                ) : (
                  <AnnotateDrawer
                    key={`annotation-drawer-${observation.id}`}
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
                    size="sm"
                  />
                )}
                <CreateNewAnnotationQueueItem
                  projectId={projectId}
                  objectId={observation.id}
                  objectType={AnnotationQueueObjectType.OBSERVATION}
                  size="sm"
                />
              </div>
            ) : null}
            {observationWithIO && isGenerationLike(observationWithIO.type) ? (
              <JumpToPlaygroundButton
                source="generation"
                generation={observationWithIO}
                analyticsEventName="trace_detail:test_in_playground_button_click"
                size="sm"
              />
            ) : null}
            <CommentDrawerButton
              projectId={projectId}
              objectId={observation.id}
              objectType="OBSERVATION"
              count={commentCount}
              size="sm"
              pendingSelection={pendingSelection}
              onSelectionUsed={onSelectionUsed}
              isOpen={isCommentDrawerOpen}
              onOpenChange={onCommentDrawerOpenChange}
            />
          </>
        }
        badges={
          !isAnnotationMode ? (
            <>
              <LatencyBadge latencySeconds={latencySeconds} />
              <TimeToFirstTokenBadge
                timeToFirstToken={observation.timeToFirstToken}
              />
              <SessionBadge
                sessionId={observation.sessionId ?? null}
                projectId={projectId}
              />
              <UserIdBadge
                userId={observation.userId ?? null}
                projectId={projectId}
              />
              <EnvironmentBadge environment={observation.environment} />
              <ReleaseBadge release={observation.release} />
              <CostBadge
                totalCost={
                  subtreeMetrics
                    ? (treeNodeTotalCost?.toNumber() ??
                      subtreeMetrics.totalCost)
                    : observation.totalCost
                }
                costDetails={
                  subtreeMetrics?.costDetails ?? observation.costDetails
                }
                priceSource={
                  isGenerationLike(observation.type) &&
                  observation.internalModelId &&
                  observation.model &&
                  observation.usagePricingTierId &&
                  observation.usagePricingTierName &&
                  Object.keys(observation.providedCostDetails).length === 0 &&
                  (!subtreeMetrics ||
                    treeNodeTotalCost?.eq(observation.totalCost ?? 0) === true)
                    ? {
                        projectId,
                        modelId: observation.internalModelId,
                        modelName: observation.model,
                        pricingTierId: observation.usagePricingTierId,
                        pricingTierName: observation.usagePricingTierName,
                      }
                    : undefined
                }
              />
              {subtreeMetrics ? (
                subtreeMetrics.hasGenerationLike &&
                subtreeMetrics.usageDetails ? (
                  <UsageBadge
                    type="GENERATION"
                    inputUsage={subtreeMetrics.inputUsage}
                    outputUsage={subtreeMetrics.outputUsage}
                    totalUsage={subtreeMetrics.totalUsage}
                    usageDetails={subtreeMetrics.usageDetails}
                  />
                ) : null
              ) : (
                <UsageBadge
                  type={observation.type}
                  inputUsage={observation.inputUsage}
                  outputUsage={observation.outputUsage}
                  totalUsage={observation.totalUsage}
                  usageDetails={observation.usageDetails}
                />
              )}
              <VersionBadge version={observation.version} />
              <ModelBadge
                model={observation.model}
                internalModelId={observation.internalModelId}
                projectId={projectId}
                usageDetails={observation.usageDetails}
              />
              <ModelParametersBadges
                modelParameters={observation.modelParameters}
              />
              <LevelBadge level={observation.level} />
              {observation.promptId ? (
                <PromptBadge
                  promptId={observation.promptId}
                  projectId={projectId}
                />
              ) : null}
            </>
          ) : null
        }
      />
    );
  },
);
