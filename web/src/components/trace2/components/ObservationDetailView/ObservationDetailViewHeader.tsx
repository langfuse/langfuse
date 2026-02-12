/**
 * ObservationDetailViewHeader - Extracted header component for ObservationDetailView
 *
 * Contains:
 * - Title row with ItemBadge, observation name, CopyIdsPopover
 * - Action buttons (Dataset, Annotate, Queue, Playground, Comments)
 * - Metadata badges (timestamp, latency, environment, cost, usage, model, etc.)
 *
 * Memoized to prevent unnecessary re-renders when tab state changes.
 */

import { memo } from "react";
import {
  type ObservationType,
  AnnotationQueueObjectType,
  isGenerationLike,
} from "@langfuse/shared";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { ItemBadge } from "@/src/components/ItemBadge";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { CopyIdsPopover } from "@/src/components/trace2/components/_shared/CopyIdsPopover";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { JumpToPlaygroundButton } from "@/src/features/playground/page/components/JumpToPlaygroundButton";
import { PromptBadge } from "@/src/components/trace2/components/_shared/PromptBadge";
import {
  LatencyBadge,
  TimeToFirstTokenBadge,
  EnvironmentBadge,
  VersionBadge,
  LevelBadge,
  StatusMessageBadge,
} from "./ObservationMetadataBadgesSimple";
import {
  SessionBadge,
  UserIdBadge,
} from "../TraceDetailView/TraceMetadataBadges";
import { CostBadge, UsageBadge } from "./ObservationMetadataBadgesTooltip";
import { ModelBadge } from "./ObservationMetadataBadgeModel";
import { ModelParametersBadges } from "./ObservationMetadataBadgeModelParameters";
import {
  type WithStringifiedMetadata,
  type MetadataDomainClient,
} from "@/src/utils/clientSideDomainTypes";
import { type ScoreDomain } from "@langfuse/shared";
import { type AggregatedTraceMetrics } from "@/src/components/trace2/lib/trace-aggregation";
import type Decimal from "decimal.js";

export interface ObservationDetailViewHeaderProps {
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
  // Inline comment props
  pendingSelection?: SelectionData | null;
  onSelectionUsed?: () => void;
  isCommentDrawerOpen?: boolean;
  onCommentDrawerOpenChange?: (open: boolean) => void;
  subtreeMetrics?: AggregatedTraceMetrics | null;
  treeNodeTotalCost?: Decimal;
}

export const ObservationDetailViewHeader = memo(
  function ObservationDetailViewHeader({
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
  }: ObservationDetailViewHeaderProps) {
    // Format cost and usage values
    const totalCost = observation.totalCost;
    const totalUsage = observation.totalUsage;
    const inputUsage = observation.inputUsage;
    const outputUsage = observation.outputUsage;

    return (
      <div className="flex-shrink-0 space-y-2 border-b p-2 @container">
        {/* Title row with actions */}
        <div className="grid w-full grid-cols-1 items-start gap-2 @2xl:grid-cols-[auto,auto] @2xl:justify-between">
          <div className="flex w-full flex-row items-start gap-1">
            <div className="mt-1.5">
              <ItemBadge type={observation.type as ObservationType} isSmall />
            </div>
            <span className="mb-0 ml-1 line-clamp-2 min-w-0 break-all font-medium md:break-normal md:break-words">
              {observation.name || observation.id}
            </span>
            <CopyIdsPopover
              idItems={[
                { id: traceId, name: "Trace ID" },
                { id: observation.id, name: "Observation ID" },
              ]}
            />
          </div>
          {/* Action buttons */}
          <div className="flex h-full flex-wrap content-start items-start justify-start gap-0.5 @2xl:mr-1 @2xl:justify-end">
            {observationWithIO && (
              <NewDatasetItemFromExistingObject
                traceId={traceId}
                observationId={observation.id}
                projectId={projectId}
                input={observationWithIO.input}
                output={observationWithIO.output}
                metadata={observationWithIO.metadata}
                key={observation.id}
                size="sm"
              />
            )}
            <div className="flex items-start">
              <AnnotateDrawer
                key={"annotation-drawer-" + observation.id}
                projectId={projectId}
                scoreTarget={{
                  type: "trace",
                  traceId: traceId,
                  observationId: observation.id,
                }}
                scores={observationScores}
                scoreMetadata={{
                  projectId: projectId,
                  environment: observation.environment,
                }}
                size="sm"
              />
              <CreateNewAnnotationQueueItem
                projectId={projectId}
                objectId={observation.id}
                objectType={AnnotationQueueObjectType.OBSERVATION}
                size="sm"
              />
            </div>
            {observationWithIO && isGenerationLike(observationWithIO.type) && (
              <JumpToPlaygroundButton
                source="generation"
                generation={observationWithIO}
                analyticsEventName="trace_detail:test_in_playground_button_click"
                size="sm"
              />
            )}
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
          </div>
        </div>

        {/* Metadata badges */}
        <div className="flex flex-col gap-2">
          {/* Timestamp */}
          <div className="flex flex-wrap items-center gap-1">
            <LocalIsoDate
              date={observation.startTime}
              accuracy="millisecond"
              className="text-sm"
            />
          </div>

          {/* Other badges */}
          <div className="flex flex-wrap items-center gap-1">
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
            <CostBadge
              totalCost={
                subtreeMetrics
                  ? (treeNodeTotalCost?.toNumber() ?? subtreeMetrics.totalCost)
                  : totalCost
              }
              costDetails={
                subtreeMetrics?.costDetails ?? observation.costDetails
              }
            />
            {subtreeMetrics ? (
              subtreeMetrics.hasGenerationLike &&
              subtreeMetrics.usageDetails && (
                <UsageBadge
                  type="GENERATION"
                  inputUsage={subtreeMetrics.inputUsage}
                  outputUsage={subtreeMetrics.outputUsage}
                  totalUsage={subtreeMetrics.totalUsage}
                  usageDetails={subtreeMetrics.usageDetails}
                />
              )
            ) : (
              <UsageBadge
                type={observation.type}
                inputUsage={inputUsage}
                outputUsage={outputUsage}
                totalUsage={totalUsage}
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
            <StatusMessageBadge statusMessage={observation.statusMessage} />
            {observation.promptId && (
              <PromptBadge
                promptId={observation.promptId}
                projectId={projectId}
              />
            )}
          </div>
        </div>
      </div>
    );
  },
);
