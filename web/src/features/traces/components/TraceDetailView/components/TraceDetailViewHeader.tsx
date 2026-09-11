/**
 * TraceDetailViewHeader - Extracted header component for TraceDetailView
 *
 * Contains:
 * - Title row with trace name and options menu
 * - Action buttons (Dataset, Annotate, Queue, Comments)
 * - Metadata badges (timestamp, target-trace link)
 *
 * Memoized to prevent unnecessary re-renders when tab state changes.
 */

import { memo } from "react";
import {
  type TraceDomain,
  type ScoreDomain,
  AnnotationQueueObjectType,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { DetailHeaderActionsMenuController } from "@/src/features/traces/components/DetailHeaderActionsMenuController";
import {
  ExistingDatasetItemsDropdownMenuController,
  NewDatasetItemFromExistingObjectDialogController,
  useDatasetItemFromTraceOrObservation,
} from "@/src/features/datasets";
import { AnnotateDrawerController } from "@/src/features/scores";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { AnnotationQueueItemDropdownMenuController } from "@/src/features/annotation-queues/components/AnnotationQueueItemDropdownMenuController";
import { AnnotationQueueItemCountBadge } from "@/src/features/annotation-queues/components/AnnotationQueueItemCountBadge";
import { TargetTraceBadge } from "../../TraceMetadataBadges";
import {
  EnvironmentBadge,
  ReleaseBadge,
  VersionBadge,
} from "../../ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
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
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";

export interface TraceDetailViewHeaderProps {
  trace: Omit<WithStringifiedMetadata<TraceDomain>, "input" | "output"> & {
    latency?: number;
    input: string | null;
    output: string | null;
  };
  parsedMetadata: unknown;
  projectId: string;
  traceScores: WithStringifiedMetadata<ScoreDomain>[];
  commentCount: number | undefined;
  commentDrawerControl: {
    disabled: boolean;
    openDrawer: () => void;
  };
}

/** Chips shown before "+N". p50 of scored traces carries 3 scores, p90 13. */
const MAX_HEADER_SCORE_GROUPS = 3;

export const TraceDetailViewHeader = memo(function TraceDetailViewHeader({
  trace,
  parsedMetadata,
  projectId,
  traceScores,
  commentCount,
  commentDrawerControl,
}: TraceDetailViewHeaderProps) {
  const { isAnnotationMode } = useViewPreferences();
  const isMobile = useIsMobile();
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
    <div className="@container shrink-0 space-y-2 p-3">
      {/* Title row with actions */}
      <div className="flex w-full flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-auto flex-row items-center gap-1">
          <span
            className={cn(
              "min-w-0 truncate text-base font-bold",
              isMobile && "flex-1",
            )}
            title={trace.name || trace.id}
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
                // forceMount + hide-when-closed: CommentDrawerController lives in
                // here, and its deep-link auto-open effect (?comments=open) and
                // controlled inline-selection flow only work while mounted. A
                // default Popover unmounts its content when closed (the default
                // state), silently breaking both. Keep it mounted, just hidden.
                forceMount
                className="flex w-auto min-w-44 flex-col gap-0.5 p-1 data-[state=closed]:hidden"
              >
                <NewDatasetItemFromExistingObjectDialogController
                  projectId={projectId}
                >
                  {({ openDialog }) => (
                    <ExistingDatasetItemsDropdownMenuController
                      projectId={projectId}
                      datasetItems={existingDatasetItems}
                      disabled={!hasDatasetAccess}
                      onOpenDialog={() =>
                        openDialog({
                          traceId: trace.id,
                          input: trace.input,
                          output: trace.output,
                          metadata: trace.metadata,
                        })
                      }
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
                              openDialog({
                                traceId: trace.id,
                                input: trace.input,
                                output: trace.output,
                                metadata: trace.metadata,
                              });
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
                    <AnnotateDrawerController projectId={projectId}>
                      {({ disabled, openDrawer }) => (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={disabled}
                          className="w-full justify-start gap-2 font-normal"
                          onClick={() =>
                            openDrawer({
                              scoreTarget: {
                                type: "trace",
                                traceId: trace.id,
                              },
                              scores: traceScores,
                              analyticsData: {
                                type: "trace",
                                source: "TraceDetail",
                              },
                              scoreMetadata: {
                                projectId,
                                environment: trace.environment,
                              },
                            })
                          }
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
                          {totalCount > 0 && (
                            <AnnotationQueueItemCountBadge
                              totalCount={totalCount}
                              layout="menu"
                            />
                          )}
                        </Button>
                      )}
                    </AnnotationQueueItemDropdownMenuController>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={commentDrawerControl.disabled}
                  onClick={commentDrawerControl.openDrawer}
                  className="w-full justify-start gap-2 font-normal"
                >
                  {commentDrawerControl.disabled ? (
                    <MessageSquareOff className="text-muted-foreground h-4 w-4" />
                  ) : (
                    <MessageSquare className="h-4 w-4" />
                  )}
                  <span className="text-sm">Comment</span>
                  {!commentDrawerControl.disabled && commentCount ? (
                    <ActionButtonCountBadge count={commentCount} />
                  ) : null}
                </Button>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {/* Action buttons (desktop inline cluster) */}
        {!isMobile && (
          <div className="flex flex-wrap content-start items-start gap-0.5">
            <NewDatasetItemFromExistingObjectDialogController
              projectId={projectId}
              key={trace.id}
            >
              {({ openDialog }) => (
                <ExistingDatasetItemsDropdownMenuController
                  projectId={projectId}
                  datasetItems={existingDatasetItems}
                  disabled={!hasDatasetAccess}
                  onOpenDialog={() =>
                    openDialog({
                      traceId: trace.id,
                      input: trace.input,
                      output: trace.output,
                      metadata: trace.metadata,
                    })
                  }
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
                          openDialog({
                            traceId: trace.id,
                            input: trace.input,
                            output: trace.output,
                            metadata: trace.metadata,
                          });
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
                <AnnotateDrawerController projectId={projectId}>
                  {({ disabled, openDrawer }) => (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={disabled}
                      className="rounded-r-none"
                      onClick={() =>
                        openDrawer({
                          scoreTarget: {
                            type: "trace",
                            traceId: trace.id,
                          },
                          scores: traceScores,
                          analyticsData: {
                            type: "trace",
                            source: "TraceDetail",
                          },
                          scoreMetadata: {
                            projectId,
                            environment: trace.environment,
                          },
                        })
                      }
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
                      className="rounded-l-none rounded-r-md border-l px-1.5"
                    >
                      <span className="relative text-xs">
                        <ChevronDown className="h-3 w-3" />
                        {totalCount > 0 && (
                          <AnnotationQueueItemCountBadge
                            totalCount={totalCount}
                            layout="toolbar"
                          />
                        )}
                      </span>
                    </Button>
                  )}
                </AnnotationQueueItemDropdownMenuController>
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={commentDrawerControl.disabled}
              onClick={commentDrawerControl.openDrawer}
              className="gap-1"
            >
              {commentDrawerControl.disabled ? (
                <MessageSquareOff className="text-muted-foreground h-3.5 w-3.5" />
              ) : (
                <>
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Comment</span>
                  {!!commentCount ? (
                    <ActionButtonCountBadge count={commentCount} />
                  ) : null}
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Timestamp on its own line: sharing the title row broke with long
          trace names. */}
      {preparedDate ? (
        <div
          title={preparedDate.title}
          className="text-muted-foreground text-xs"
        >
          {preparedDate.display}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {/* Trace-level totals (latency, session, user, cost, usage, tags)
            live in the TraceSummaryStrip, not here — its compact usage badge
            already carries the breakdown tooltip. This header adds the
            target-trace link plus a quiet attribute line for the trace's
            own env/release/version. */}
        {!isAnnotationMode && (
          <>
            <CollapsibleBadgeRow>
              <TargetTraceBadge
                targetTraceId={targetTraceId}
                projectId={projectId}
              />
            </CollapsibleBadgeRow>
            <CollapsibleBadgeRow>
              <EnvironmentBadge environment={trace.environment} />
              <ReleaseBadge release={trace.release} />
              <VersionBadge version={trace.version} />
            </CollapsibleBadgeRow>
          </>
        )}
        {/* Trace-level scores as chips, three names inline, "+N" opens the
            full list. Same cap as the observation header and tree rows. */}
        {traceScores.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <GroupedScoreBadges
              scores={traceScores}
              maxVisible={MAX_HEADER_SCORE_GROUPS}
            />
          </div>
        )}
      </div>
    </div>
  );
});
