/**
 * TraceDetailViewHeader - Extracted header component for TraceDetailView
 *
 * Contains:
 * - Title row with ItemBadge, trace name, CopyIdsPopover
 * - Action buttons (Dataset, Annotate, Queue, Comments)
 * - Metadata badges (timestamp, latency, session, user, environment, release, version, cost, usage)
 *
 * Memoized to prevent unnecessary re-renders when tab state changes.
 */

import { memo, useMemo } from "react";
import {
  type TraceDomain,
  type ScoreDomain,
  AnnotationQueueObjectType,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { ItemBadge } from "@/src/components/ItemBadge";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { CopyIdsPopover } from "@/src/components/trace2/components/_shared/CopyIdsPopover";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import {
  SessionBadge,
  UserIdBadge,
  EnvironmentBadge,
  ReleaseBadge,
  VersionBadge,
  TargetTraceBadge,
} from "./TraceMetadataBadges";
import { LatencyBadge } from "../ObservationDetailView/ObservationMetadataBadgesSimple";
import {
  CostBadge,
  UsageBadge,
} from "../ObservationDetailView/ObservationMetadataBadgesTooltip";
import { aggregateTraceMetrics } from "@/src/components/trace2/lib/trace-aggregation";
import { resolveEvalExecutionMetadata } from "@/src/components/trace2/lib/resolve-metadata";

export interface TraceDetailViewHeaderProps {
  trace: Omit<WithStringifiedMetadata<TraceDomain>, "input" | "output"> & {
    latency?: number;
    input: string | null;
    output: string | null;
  };
  observations: ObservationReturnTypeWithMetadata[];
  parsedMetadata: unknown;
  projectId: string;
  traceScores: WithStringifiedMetadata<ScoreDomain>[];
  commentCount: number | undefined;
  // Inline comment props
  pendingSelection?: SelectionData | null;
  onSelectionUsed?: () => void;
  isCommentDrawerOpen?: boolean;
  onCommentDrawerOpenChange?: (open: boolean) => void;
}

export const TraceDetailViewHeader = memo(function TraceDetailViewHeader({
  trace,
  observations,
  parsedMetadata,
  projectId,
  traceScores,
  commentCount,
  pendingSelection,
  onSelectionUsed,
  isCommentDrawerOpen,
  onCommentDrawerOpenChange,
}: TraceDetailViewHeaderProps) {
  const aggregatedMetrics = useMemo(
    () => aggregateTraceMetrics(observations),
    [observations],
  );

  const targetTraceId =
    trace.environment === LangfuseInternalTraceEnvironment.LLMJudge
      ? resolveEvalExecutionMetadata(parsedMetadata)
      : null;

  return (
    <div className="flex-shrink-0 space-y-2 border-b p-2 @container">
      {/* Title row with actions */}
      <div className="grid w-full grid-cols-1 items-start gap-2 @2xl:grid-cols-[auto,auto] @2xl:justify-between">
        <div className="flex w-full flex-row items-start gap-1">
          <div className="mt-1.5">
            <ItemBadge type="TRACE" isSmall />
          </div>
          <span className="mb-0 ml-1 line-clamp-2 min-w-0 break-all font-medium md:break-normal md:break-words">
            {trace.name || trace.id}
          </span>
          <CopyIdsPopover idItems={[{ id: trace.id, name: "Trace ID" }]} />
        </div>
        {/* Action buttons */}
        <div className="flex h-full flex-wrap content-start items-start justify-start gap-0.5 @2xl:mr-1 @2xl:justify-end">
          <NewDatasetItemFromExistingObject
            traceId={trace.id}
            projectId={projectId}
            input={trace.input}
            output={trace.output}
            metadata={trace.metadata}
            key={trace.id}
            size="sm"
          />
          <div className="flex items-start">
            <AnnotateDrawer
              key={"annotation-drawer-" + trace.id}
              projectId={projectId}
              scoreTarget={{
                type: "trace",
                traceId: trace.id,
              }}
              scores={traceScores}
              scoreMetadata={{
                projectId: projectId,
                environment: trace.environment,
              }}
              size="sm"
            />
            <CreateNewAnnotationQueueItem
              projectId={projectId}
              objectId={trace.id}
              objectType={AnnotationQueueObjectType.TRACE}
              size="sm"
            />
          </div>
          <CommentDrawerButton
            projectId={projectId}
            objectId={trace.id}
            objectType="TRACE"
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
            date={trace.timestamp}
            accuracy="millisecond"
            className="text-sm"
          />
        </div>

        {/* Other badges */}
        <div className="flex flex-wrap items-center gap-1">
          <LatencyBadge latencySeconds={trace.latency ?? null} />
          <SessionBadge sessionId={trace.sessionId} projectId={projectId} />
          <UserIdBadge userId={trace.userId} projectId={projectId} />
          <TargetTraceBadge
            targetTraceId={targetTraceId}
            projectId={projectId}
          />
          <EnvironmentBadge environment={trace.environment} />
          <ReleaseBadge release={trace.release} />
          <VersionBadge version={trace.version} />
          <CostBadge
            totalCost={aggregatedMetrics.totalCost}
            costDetails={aggregatedMetrics.costDetails}
          />
          {aggregatedMetrics.hasGenerationLike &&
            aggregatedMetrics.usageDetails && (
              <UsageBadge
                type="GENERATION"
                inputUsage={aggregatedMetrics.inputUsage}
                outputUsage={aggregatedMetrics.outputUsage}
                totalUsage={aggregatedMetrics.totalUsage}
                usageDetails={aggregatedMetrics.usageDetails}
              />
            )}
        </div>
      </div>
    </div>
  );
});
