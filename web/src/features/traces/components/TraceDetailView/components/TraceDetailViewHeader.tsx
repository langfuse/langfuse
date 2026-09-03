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
import { DetailHeaderActionsMenuController } from "@/src/features/traces/components/DetailHeaderActionsMenuController";
import { ExistingDatasetItemsDropdownMenuController } from "@/src/features/datasets/components/ExistingDatasetItemsDropdownMenuController";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets/components/NewDatasetItemFromExistingObjectDialogController";
import { useDatasetItemFromTraceOrObservation } from "@/src/features/datasets/hooks/useDatasetItemFromTraceOrObservation";
import { AnnotateDrawerController } from "@/src/features/scores/components/AnnotateDrawerController";
import { CommentDrawerController } from "@/src/features/comments/CommentDrawerController";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { AnnotationQueueItemDropdownMenuController } from "@/src/features/annotation-queues/components/AnnotationQueueItemDropdownMenuController";
import { AnnotationQueueItemCountBadge } from "@/src/features/annotation-queues/components/AnnotationQueueItemCountBadge";
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
import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { Button } from "@/src/components/ui/button";
import {
  ChevronDown,
  EllipsisVertical,
  ListPlus,
  LockIcon,
  MessageSquare,
  MessageSquareOff,
  MoreHorizontal,
  PlusIcon,
  SquarePen,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";
import { buildLocalIsoDatePresentation } from "@/src/utils/dates";

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
  isSessionScope: boolean;
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
  isSessionScope,
}: TraceDetailViewHeaderProps) {
  const { isAnnotationMode } = useViewPreferences();
  const isMobile = useIsMobile();
  const aggregatedMetrics = useMemo(
    () => aggregateTraceMetrics(observations),
    [observations],
  );
  const {
    existingDatasetItems,
    hasAccess: hasDatasetAccess,
    captureNewDatasetItemFormOpen,
  } = useDatasetItemFromTraceOrObservation({
    projectId,
    traceId: trace.id,
  });
  const datasetCount = existingDatasetItems.length;
  const hasExistingDatasetItems = datasetCount > 0;

  const targetTraceId =
    trace.environment === LangfuseInternalTraceEnvironment.LLMJudge
      ? resolveEvalExecutionMetadata(parsedMetadata)
      : null;

  const preparedDate = buildLocalIsoDatePresentation({
    date: trace.timestamp,
    accuracy: "millisecond",
  });

  return (
    <div className="@container shrink-0 space-y-2 border-b p-2">
      {/* Title row with actions */}
      <div className="grid w-full grid-cols-1 items-start gap-2 @2xl:grid-cols-[auto_auto] @2xl:justify-between">
        <div className="flex w-full flex-row items-center gap-1">
          <ItemBadge type={isSessionScope ? "SESSION" : "TRACE"} isSmall />
          <span
            className={cn(
              "line-clamp-2 min-w-0 font-bold break-all md:break-normal md:wrap-break-word",
              isMobile && "flex-1",
            )}
          >
            {isSessionScope ? "Session" : trace.name || trace.id}
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
                // forceMount + hide-when-closed: CommentDrawerController lives in
                // here, and its deep-link auto-open effect (?comments=open) and
                // controlled inline-selection flow only work while mounted. A
                // default Popover unmounts its content when closed (the default
                // state), silently breaking both. Keep it mounted, just hidden.
                forceMount
                className="flex w-auto min-w-44 flex-col gap-0.5 p-1 data-[state=closed]:hidden"
              >
                <NewDatasetItemFromExistingObjectDialogController
                  traceId={trace.id}
                  projectId={projectId}
                  input={trace.input}
                  output={trace.output}
                  metadata={trace.metadata}
                >
                  {({ openDialog }) => (
                    <ExistingDatasetItemsDropdownMenuController
                      projectId={projectId}
                      datasetItems={existingDatasetItems}
                      disabled={!hasDatasetAccess}
                      onOpenDialog={openDialog}
                    >
                      {({ Anchor, openDropdown }) => (
                        <Anchor>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!hasDatasetAccess}
                            className="w-full justify-start gap-2 font-normal"
                            onClick={() => {
                              if (hasExistingDatasetItems) {
                                openDropdown();
                                return;
                              }

                              captureNewDatasetItemFormOpen();
                              openDialog();
                            }}
                          >
                            {hasExistingDatasetItems || hasDatasetAccess ? (
                              <PlusIcon
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                            ) : null}
                            <span className="text-sm">
                              {hasExistingDatasetItems
                                ? `In ${datasetCount} dataset(s)`
                                : "Add to datasets"}
                            </span>
                            {hasExistingDatasetItems ? (
                              <ChevronDown className="ml-auto h-3 w-3" />
                            ) : !hasDatasetAccess ? (
                              <LockIcon
                                className="ml-auto h-3 w-3"
                                aria-hidden="true"
                              />
                            ) : null}
                          </Button>
                        </Anchor>
                      )}
                    </ExistingDatasetItemsDropdownMenuController>
                  )}
                </NewDatasetItemFromExistingObjectDialogController>
                {!isAnnotationMode && (
                  <>
                    <AnnotateDrawerController
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
                    >
                      {({ disabled, openDrawer }) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={disabled}
                          className="w-full justify-start gap-2 font-normal"
                          onClick={openDrawer}
                        >
                          {disabled ? (
                            <LockIcon className="h-3 w-3" />
                          ) : (
                            <SquarePen className="h-4 w-4" />
                          )}
                          <span className="text-sm">Annotate</span>
                        </Button>
                      )}
                    </AnnotateDrawerController>
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
                <CommentDrawerController
                  projectId={projectId}
                  objectId={trace.id}
                  objectType="TRACE"
                  count={commentCount}
                  pendingSelection={pendingSelection}
                  onSelectionUsed={onSelectionUsed}
                  isOpen={isCommentDrawerOpen}
                  onOpenChange={onCommentDrawerOpenChange}
                >
                  {({ disabled, openDrawer }) => (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={openDrawer}
                      className="w-full justify-start gap-2 font-normal"
                    >
                      {disabled ? (
                        <MessageSquareOff className="text-muted-foreground h-4 w-4" />
                      ) : (
                        <MessageSquare className="h-4 w-4" />
                      )}
                      <span className="text-sm">Add comment</span>
                      {!disabled && commentCount ? (
                        <ActionButtonCountBadge count={commentCount} />
                      ) : null}
                    </Button>
                  )}
                </CommentDrawerController>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {/* Action buttons (desktop inline cluster) */}
        {!isMobile && (
          <div className="flex h-full flex-wrap content-start items-start justify-start gap-0.5 @2xl:mr-1 @2xl:justify-end">
            <NewDatasetItemFromExistingObjectDialogController
              traceId={trace.id}
              projectId={projectId}
              input={trace.input}
              output={trace.output}
              metadata={trace.metadata}
              key={trace.id}
            >
              {({ openDialog }) => (
                <ExistingDatasetItemsDropdownMenuController
                  projectId={projectId}
                  datasetItems={existingDatasetItems}
                  disabled={!hasDatasetAccess}
                  onOpenDialog={openDialog}
                >
                  {({ Anchor, openDropdown }) => (
                    <Anchor>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!hasDatasetAccess}
                        onClick={() => {
                          if (hasExistingDatasetItems) {
                            openDropdown();
                            return;
                          }

                          captureNewDatasetItemFormOpen();
                          openDialog();
                        }}
                      >
                        {!hasExistingDatasetItems && hasDatasetAccess ? (
                          <PlusIcon
                            className="mr-1.5 -ml-0.5 h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        ) : null}
                        {hasExistingDatasetItems
                          ? `In ${datasetCount} dataset(s)`
                          : "Add to datasets"}
                        {hasExistingDatasetItems ? (
                          <ChevronDown className="ml-2 h-3 w-3" />
                        ) : !hasDatasetAccess ? (
                          <LockIcon
                            className="ml-1.5 h-3 w-3"
                            aria-hidden="true"
                          />
                        ) : null}
                      </Button>
                    </Anchor>
                  )}
                </ExistingDatasetItemsDropdownMenuController>
              )}
            </NewDatasetItemFromExistingObjectDialogController>
            {/* Hide annotation buttons in annotation mode (panel shown separately) */}
            {!isAnnotationMode && (
              <div className="flex items-start">
                <AnnotateDrawerController
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
                >
                  {({ disabled, openDrawer }) => (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={disabled}
                      className="rounded-r-none"
                      onClick={openDrawer}
                    >
                      {disabled ? (
                        <LockIcon className="mr-1.5 h-3 w-3" />
                      ) : (
                        <SquarePen className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      <span>Annotate</span>
                    </Button>
                  )}
                </AnnotateDrawerController>
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
            <CommentDrawerController
              projectId={projectId}
              objectId={trace.id}
              objectType="TRACE"
              count={commentCount}
              pendingSelection={pendingSelection}
              onSelectionUsed={onSelectionUsed}
              isOpen={isCommentDrawerOpen}
              onOpenChange={onCommentDrawerOpenChange}
            >
              {({ disabled, openDrawer }) => (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={openDrawer}
                  className="gap-1"
                >
                  {disabled ? (
                    <MessageSquareOff className="text-muted-foreground h-3.5 w-3.5" />
                  ) : (
                    <>
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Add comment</span>
                      {!!commentCount ? (
                        <ActionButtonCountBadge count={commentCount} />
                      ) : null}
                    </>
                  )}
                </Button>
              )}
            </CommentDrawerController>
          </div>
        )}
      </div>

      {/* Metadata badges */}
      <div className="flex flex-col gap-2">
        {/* Timestamp */}
        {preparedDate ? (
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <span title={preparedDate.title}>{preparedDate.display}</span>
          </div>
        ) : null}

        {/* Other badges */}
        {!isAnnotationMode && (
          <CollapsibleBadgeRow>
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
          </CollapsibleBadgeRow>
        )}
      </div>
    </div>
  );
});
