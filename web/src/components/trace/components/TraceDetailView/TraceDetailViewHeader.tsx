/**
 * TraceDetailViewHeader - Extracted header component for TraceDetailView
 *
 * Contains:
 * - Title row with type chip, trace name + mono timestamp, actions menu
 * - Action buttons (Dataset, Annotate, Queue, Comments)
 * - Overview metrics grid (latency, session, user, environment, release, version, cost, usage)
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
import {
  OverviewGrid,
  TypeChip,
} from "@/src/components/trace/components/_shared/InspectorElements";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { DetailHeaderActionsMenu } from "@/src/components/trace/components/_shared/DetailHeaderActionsMenu";
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
import { aggregateTraceMetrics } from "@/src/components/trace/lib/trace-aggregation";
import { resolveEvalExecutionMetadata } from "@/src/components/trace/lib/resolve-metadata";
import { useViewPreferences } from "@/src/components/trace/contexts/ViewPreferencesContext";

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
  const { isAnnotationMode } = useViewPreferences();
  const aggregatedMetrics = useMemo(
    () => aggregateTraceMetrics(observations),
    [observations],
  );

  const targetTraceId =
    trace.environment === LangfuseInternalTraceEnvironment.LLMJudge
      ? resolveEvalExecutionMetadata(parsedMetadata)
      : null;

  return (
    <div className="@container shrink-0 space-y-3 p-3 pb-2.5">
      {/* Title row with actions */}
      <div className="grid w-full grid-cols-1 items-start gap-2 @2xl:grid-cols-[auto_auto] @2xl:justify-between">
        <div className="flex w-full flex-row items-start gap-2">
          <TypeChip type="TRACE" className="mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="line-clamp-2 min-w-0 text-sm font-bold break-all md:break-normal md:wrap-break-word">
              {trace.name || trace.id}
            </div>
            <LocalIsoDate
              date={trace.timestamp}
              accuracy="millisecond"
              className="text-muted-foreground font-mono text-[10px]"
            />
          </div>
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
          {/* Hide annotation buttons in annotation mode (panel shown separately) */}
          {!isAnnotationMode && (
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
          )}
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
          <DetailHeaderActionsMenu
            idItems={[{ id: trace.id, name: "Trace ID" }]}
            projectId={projectId}
            webCallout={{
              traceId: trace.id,
              sessionId: trace.sessionId ?? null,
            }}
          />
        </div>
      </div>

      {/* Overview metrics grid */}
      {!isAnnotationMode && (
        <OverviewGrid>
          <LatencyBadge latencySeconds={trace.latency ?? null} />
          <EnvironmentBadge environment={trace.environment} />
          <UserIdBadge userId={trace.userId} projectId={projectId} />
          <SessionBadge sessionId={trace.sessionId} projectId={projectId} />
          <TargetTraceBadge
            targetTraceId={targetTraceId}
            projectId={projectId}
          />
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
          <ReleaseBadge release={trace.release} />
          <VersionBadge version={trace.version} />
        </OverviewGrid>
      )}
    </div>
  );
});
