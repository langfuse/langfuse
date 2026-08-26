/**
 * TraceDetailViewHeader - Extracted header component for TraceDetailView
 *
 * Contains:
 * - Title row with ItemBadge, trace name, options menu
 * - Action buttons (Dataset, Annotate, Queue, Comments)
 * - Metadata badges (timestamp, latency, session, user, environment, release, version, cost, usage)
 *
 * Memoized to prevent unnecessary re-renders when tab state changes.
 */

import { memo, useMemo, type ReactNode } from "react";
import {
  type TraceDomain,
  type ScoreDomain,
  AnnotationQueueObjectType,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { HeaderMetaRow } from "@/src/components/layouts/header-meta-row";
import {
  HeaderPill,
  HeaderPillValue,
} from "@/src/components/layouts/header-pill";
import { ItemBadge } from "@/src/components/ItemBadge";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { DetailHeaderActionsMenuController } from "@/src/features/traces/components/DetailHeaderActionsMenuController";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { AnnotationQueueItemDropdownMenuController } from "@/src/features/annotation-queues/components/AnnotationQueueItemDropdownMenuController";
import { AnnotationQueueItemCountBadge } from "@/src/features/annotation-queues/components/AnnotationQueueItemCountBadge";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import {
  SessionBadge,
  UserIdBadge,
  EnvironmentBadge,
  ReleaseBadge,
  VersionBadge,
  TargetTraceBadge,
} from "../../TraceMetadataBadges";
import { LatencyBadge } from "../../ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import { CostBadge, UsageBadge } from "../../ObservationMetadataBadgesTooltip";
import { aggregateTraceMetrics } from "@/src/features/traces/fns/traceAggregation";
import { resolveEvalExecutionMetadata } from "@/src/features/traces/fns/resolveMetadata";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { Button } from "@/src/components/ui/button";
import {
  ChevronDown,
  EllipsisVertical,
  ListPlus,
  MoreHorizontal,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";

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
  const isMobile = useIsMobile();
  const aggregatedMetrics = useMemo(
    () => aggregateTraceMetrics(observations),
    [observations],
  );

  const targetTraceId =
    trace.environment === LangfuseInternalTraceEnvironment.LLMJudge
      ? resolveEvalExecutionMetadata(parsedMetadata)
      : null;

  const pills: Array<{ key: string; searchText: string; content: ReactNode }> =
    [
      {
        key: "timestamp",
        searchText: `time ${trace.timestamp.toISOString()}`,
        content: (
          <HeaderPill variant="display">
            <HeaderPillValue>
              <LocalIsoDate date={trace.timestamp} accuracy="millisecond" />
            </HeaderPillValue>
          </HeaderPill>
        ),
      },
    ];

  if (trace.latency != null) {
    pills.push({
      key: "latency",
      searchText: `latency ${trace.latency}`,
      content: <LatencyBadge latencySeconds={trace.latency} />,
    });
  }
  if (trace.sessionId) {
    pills.push({
      key: "session",
      searchText: `session ${trace.sessionId}`,
      content: (
        <SessionBadge sessionId={trace.sessionId} projectId={projectId} />
      ),
    });
  }
  if (trace.userId) {
    pills.push({
      key: "user",
      searchText: `user ${trace.userId}`,
      content: <UserIdBadge userId={trace.userId} projectId={projectId} />,
    });
  }
  if (targetTraceId) {
    pills.push({
      key: "target-trace",
      searchText: `target ${targetTraceId}`,
      content: (
        <TargetTraceBadge targetTraceId={targetTraceId} projectId={projectId} />
      ),
    });
  }
  if (trace.environment) {
    pills.push({
      key: "environment",
      searchText: `environment env ${trace.environment}`,
      content: <EnvironmentBadge environment={trace.environment} />,
    });
  }
  if (trace.release) {
    pills.push({
      key: "release",
      searchText: `release ${trace.release}`,
      content: <ReleaseBadge release={trace.release} />,
    });
  }
  if (trace.version) {
    pills.push({
      key: "version",
      searchText: `version ${trace.version}`,
      content: <VersionBadge version={trace.version} />,
    });
  }
  if (aggregatedMetrics.totalCost != null && aggregatedMetrics.costDetails) {
    pills.push({
      key: "cost",
      searchText: `cost ${aggregatedMetrics.totalCost}`,
      content: (
        <CostBadge
          totalCost={aggregatedMetrics.totalCost}
          costDetails={aggregatedMetrics.costDetails}
        />
      ),
    });
  }
  if (
    aggregatedMetrics.hasGenerationLike &&
    aggregatedMetrics.usageDetails &&
    aggregatedMetrics.totalUsage > 0
  ) {
    pills.push({
      key: "tokens",
      searchText: `tokens ${aggregatedMetrics.inputUsage} ${aggregatedMetrics.outputUsage} ${aggregatedMetrics.totalUsage}`,
      content: (
        <UsageBadge
          type="GENERATION"
          inputUsage={aggregatedMetrics.inputUsage}
          outputUsage={aggregatedMetrics.outputUsage}
          totalUsage={aggregatedMetrics.totalUsage}
          usageDetails={aggregatedMetrics.usageDetails}
        />
      ),
    });
  }

  return (
    <div className="@container shrink-0">
      <div className="border-b p-2">
        {/* Title row with actions */}
        <div className="grid w-full grid-cols-1 items-start gap-2 @2xl:grid-cols-[auto_auto] @2xl:justify-between">
          <div className="flex w-full flex-row items-center gap-1">
            <ItemBadge type="TRACE" isSmall />
            <span
              className={cn(
                "line-clamp-2 min-w-0 font-bold break-all md:break-normal md:wrap-break-word",
                isMobile && "flex-1",
              )}
            >
              {trace.name || trace.id}
            </span>
            <DetailHeaderActionsMenuController
              idItems={[{ id: trace.id, name: "Trace ID" }]}
              projectId={projectId}
              webCallout={{
                traceId: trace.id,
                sessionId: trace.sessionId ?? null,
              }}
            >
              {({ Trigger }) => (
                <Trigger asChild>
                  <Button
                    aria-label="Options"
                    className="mt-0.5 shrink-0"
                    size="icon-xs"
                    title="Options"
                    variant="ghost"
                  >
                    <EllipsisVertical className="h-4 w-4" />
                  </Button>
                </Trigger>
              )}
            </DetailHeaderActionsMenuController>
            {/* Mobile: collapse the action-button cluster into a `⋯` overflow of
              full-width labeled rows, next to the `⋮` utility menu. */}
            {isMobile && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="More actions"
                    className="ml-auto shrink-0"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  // forceMount + hide-when-closed: CommentDrawerButton lives in
                  // here, and its deep-link auto-open effect (?comments=open) and
                  // controlled inline-selection flow only work while mounted. A
                  // default Popover unmounts its content when closed (the default
                  // state), silently breaking both. Keep it mounted, just hidden.
                  forceMount
                  className="flex w-auto min-w-44 flex-col gap-0.5 p-1 data-[state=closed]:hidden"
                >
                  <NewDatasetItemFromExistingObject
                    traceId={trace.id}
                    projectId={projectId}
                    input={trace.input}
                    output={trace.output}
                    metadata={trace.metadata}
                    layout="menu"
                  />
                  {!isAnnotationMode && (
                    <>
                      <AnnotateDrawer
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
                        layout="menu"
                      />
                      <AnnotationQueueItemDropdownMenuController
                        projectId={projectId}
                        objectId={trace.id}
                        objectType={AnnotationQueueObjectType.TRACE}
                      >
                        {({ disabled, totalCount }) => (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={disabled !== undefined}
                            className="w-full justify-start gap-2 font-normal"
                          >
                            <ListPlus className="h-4 w-4" />
                            <span className="text-sm">Add to queue</span>
                            <AnnotationQueueItemCountBadge
                              totalCount={totalCount}
                              layout="menu"
                            />
                          </Button>
                        )}
                      </AnnotationQueueItemDropdownMenuController>
                    </>
                  )}
                  <CommentDrawerButton
                    projectId={projectId}
                    objectId={trace.id}
                    objectType="TRACE"
                    count={commentCount}
                    layout="menu"
                    pendingSelection={pendingSelection}
                    onSelectionUsed={onSelectionUsed}
                    isOpen={isCommentDrawerOpen}
                    onOpenChange={onCommentDrawerOpenChange}
                  />
                </PopoverContent>
              </Popover>
            )}
          </div>
          {/* Action buttons (desktop inline cluster) */}
          {!isMobile && (
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
                  <AnnotationQueueItemDropdownMenuController
                    projectId={projectId}
                    objectId={trace.id}
                    objectType={AnnotationQueueObjectType.TRACE}
                  >
                    {({ disabled, totalCount }) => (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={disabled !== undefined}
                        className="rounded-l-none rounded-r-md border-l-2"
                      >
                        <span className="relative mr-1 text-xs">
                          <ChevronDown className="h-3 w-3" />
                          <AnnotationQueueItemCountBadge
                            totalCount={totalCount}
                            layout="toolbar"
                          />
                        </span>
                      </Button>
                    )}
                  </AnnotationQueueItemDropdownMenuController>
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
            </div>
          )}
        </div>
      </div>
      {!isAnnotationMode ? (
        <HeaderMetaRow items={pills} noun="trace details" />
      ) : null}
    </div>
  );
});
