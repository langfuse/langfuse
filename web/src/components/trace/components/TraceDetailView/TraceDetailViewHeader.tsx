/**
 * TraceDetailViewHeader - Extracted header component for TraceDetailView
 *
 * Contains:
 * - Title row with type chip, trace name + mono timestamp, actions menu
 * - Action buttons (Dataset, Annotate, Queue, Comments)
 * - Overview metrics grid (latency, session, user, environment, release, version, cost, usage)
 *
 * Mobile (LFE-11067): the action cluster collapses into a `⋯` overflow popover
 * of labeled menu rows next to the `⋮` utility menu, and the overview metrics
 * clip to a single expandable line (CollapsibleBadgeRow).
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
import { AddToDropdownMenu } from "@/src/components/trace/components/_shared/AddToDropdownMenu";
import { MobileHeaderOverflowPopover } from "@/src/components/trace/components/_shared/MobileHeaderOverflowPopover";
import { AnnotationForm } from "@/src/features/scores/components/AnnotationForm";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
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
import { CollapsibleBadgeRow } from "@/src/components/trace/components/_shared/CollapsibleBadgeRow";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Button } from "@/src/components/ui/button";
import { LockIcon, SquarePen } from "lucide-react";
import { Drawer, DrawerContent } from "@/src/components/ui/drawer";
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
  // Annotate drawer is view-owned so the Scores accordion can open it too
  isAnnotateDrawerOpen: boolean;
  onAnnotateDrawerOpenChange: (open: boolean) => void;
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
  isAnnotateDrawerOpen,
  onAnnotateDrawerOpenChange,
}: TraceDetailViewHeaderProps) {
  const { isAnnotationMode } = useViewPreferences();
  const isMobile = useIsMobile();
  const capture = usePostHogClientCapture();
  const hasAnnotationAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });
  const aggregatedMetrics = useMemo(
    () => aggregateTraceMetrics(observations),
    [observations],
  );

  const hasNonAnnotationScores = traceScores.some(
    (score) => score.source !== "ANNOTATION",
  );

  const targetTraceId =
    trace.environment === LangfuseInternalTraceEnvironment.LLMJudge
      ? resolveEvalExecutionMetadata(parsedMetadata)
      : null;

  const annotateContent = (
    <>
      <AnnotationForm
        serverScores={traceScores}
        scoreTarget={{
          type: "trace",
          traceId: trace.id,
        }}
        scoreMetadata={{
          projectId: projectId,
          environment: trace.environment,
        }}
        analyticsData={{ type: "trace", source: "TraceDetail" }}
      />
      {hasNonAnnotationScores && (
        <div className="text-muted-foreground mt-4 text-xs">
          API and eval scores visible on left. Add manual annotations above.
        </div>
      )}
    </>
  );

  const openAnnotateDrawer = () => {
    onAnnotateDrawerOpenChange(true);
    capture(
      traceScores.length > 0
        ? "score:update_form_open"
        : "score:create_form_open",
      { type: "trace", source: "TraceDetail" },
    );
  };

  const overviewCells = (
    <>
      <LatencyBadge latencySeconds={trace.latency ?? null} />
      <EnvironmentBadge environment={trace.environment} />
      <UserIdBadge userId={trace.userId} projectId={projectId} />
      <SessionBadge sessionId={trace.sessionId} projectId={projectId} />
      <TargetTraceBadge targetTraceId={targetTraceId} projectId={projectId} />
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
    </>
  );

  return (
    <div className="@container shrink-0 space-y-3 p-3 pb-2.5">
      {/* Title row with actions — mobile keeps one row with the `⋯` overflow */}
      <div
        className={
          isMobile
            ? "flex w-full items-start gap-2"
            : "grid w-full grid-cols-1 items-start gap-2 @2xl:grid-cols-[auto_auto] @2xl:justify-between"
        }
      >
        <div
          className={cn(
            "flex flex-row items-start gap-2",
            isMobile ? "min-w-0 flex-1" : "w-full",
          )}
        >
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
        {isMobile ? (
          /* Mobile: collapse the action cluster into a `⋯` overflow of
             full-width labeled rows, next to the `⋮` utility menu. */
          <div className="flex shrink-0 items-center gap-1">
            <MobileHeaderOverflowPopover>
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
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!hasAnnotationAccess}
                    className="w-full justify-start gap-2 font-normal"
                    onClick={openAnnotateDrawer}
                  >
                    {!hasAnnotationAccess ? (
                      <LockIcon className="h-3 w-3" />
                    ) : (
                      <SquarePen className="h-4 w-4" />
                    )}
                    <span className="text-sm">Annotate</span>
                  </Button>
                  <CreateNewAnnotationQueueItem
                    projectId={projectId}
                    objectId={trace.id}
                    objectType={AnnotationQueueObjectType.TRACE}
                    layout="menu"
                  />
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
            </MobileHeaderOverflowPopover>
            <DetailHeaderActionsMenu
              idItems={[{ id: trace.id, name: "Trace ID" }]}
              projectId={projectId}
              webCallout={{
                traceId: trace.id,
                sessionId: trace.sessionId ?? null,
              }}
            />
            {/* The annotate drawer is hosted by AddToDropdownMenu on desktop;
                mount it here on mobile so the Scores accordion and the
                overflow row can still open it. */}
            <Drawer
              open={isAnnotateDrawerOpen}
              onOpenChange={onAnnotateDrawerOpenChange}
            >
              <DrawerContent className="p-3">
                {isAnnotateDrawerOpen ? annotateContent : null}
              </DrawerContent>
            </Drawer>
          </div>
        ) : (
          /* Action buttons — grouped per the inspector design */
          <div className="flex h-full flex-wrap content-start items-center justify-start gap-1 @2xl:mr-1 @2xl:justify-end">
            <AddToDropdownMenu
              projectId={projectId}
              traceId={trace.id}
              datasetPrefill={{
                input: trace.input,
                output: trace.output,
                metadata: trace.metadata,
              }}
              annotateContent={annotateContent}
              isAnnotateDrawerOpen={isAnnotateDrawerOpen}
              onAnnotateDrawerOpenChange={onAnnotateDrawerOpenChange}
              hasExistingScores={traceScores.length > 0}
              showAnnotate={!isAnnotationMode}
              onOpenComments={() => onCommentDrawerOpenChange?.(true)}
              commentCount={commentCount}
            />
            {/* Annotation-queue toggles need their own checkbox dropdown, so
                this stays a compact chevron button next to the menu. */}
            {!isAnnotationMode && (
              <div className="[&>button]:h-7 [&>button]:rounded-md [&>button]:border-l">
                <CreateNewAnnotationQueueItem
                  projectId={projectId}
                  objectId={trace.id}
                  objectType={AnnotationQueueObjectType.TRACE}
                  variant="outline"
                  size="sm"
                />
              </div>
            )}
            <DetailHeaderActionsMenu
              idItems={[{ id: trace.id, name: "Trace ID" }]}
              projectId={projectId}
              webCallout={{
                traceId: trace.id,
                sessionId: trace.sessionId ?? null,
              }}
            />
            {/* Hidden host for the comment drawer: keeps deep-link auto-open
                (?comments=open) and inline-comment selection wiring intact;
                opened from the "Add comment" menu item via controlled state. */}
            <span className="hidden">
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
            </span>
          </div>
        )}
      </div>

      {/* Overview metrics grid — clipped to one expandable line on mobile */}
      {!isAnnotationMode &&
        (isMobile ? (
          <CollapsibleBadgeRow className="gap-x-4">
            {overviewCells}
          </CollapsibleBadgeRow>
        ) : (
          <OverviewGrid>{overviewCells}</OverviewGrid>
        ))}
    </div>
  );
});
