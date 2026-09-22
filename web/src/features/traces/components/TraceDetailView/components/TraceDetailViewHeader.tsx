/**
 * TraceDetailViewHeader - Extracted header component for TraceDetailView
 *
 * Contains:
 * - Title row with ItemBadge, trace name, options menu
 * - Action buttons (Add to, Annotate, Comment)
 * - Metadata badges (timestamp, environment, release, version, target trace)
 * - Trace-level score chips
 *
 * Memoized to prevent unnecessary re-renders when tab state changes.
 */

import { memo, useState } from "react";
import { useReadPath } from "@/src/features/events";
import {
  type TraceDomain,
  type ScoreDomain,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { ItemBadge } from "@/src/components/ItemBadge";
import { ConnectedDetailHeaderActionsMenuController } from "@/src/features/traces/components/DetailHeaderActionsMenuController";
import { AnnotateDrawerController } from "@/src/features/scores";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { ConnectedTraceObservationAddToDropdownMenuController } from "@/src/features/traces/components/ConnectedTraceObservationAddToDropdownMenuController";
import {
  EnvironmentBadge,
  ReleaseBadge,
  VersionBadge,
  TargetTraceBadge,
} from "../../TraceMetadataBadges";
import { resolveEvalExecutionMetadata } from "@/src/features/traces/fns/resolveMetadata";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { Button } from "@/src/components/ui/button";
import {
  ChevronDown,
  EllipsisVertical,
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
  parsedMetadata: unknown;
  projectId: string;
  traceScores: WithStringifiedMetadata<ScoreDomain>[];
  commentCount: number | undefined;
  commentDrawerControl: {
    disabled: boolean;
    openDrawer: () => void;
  };
}

export const TraceDetailViewHeader = memo(function TraceDetailViewHeader({
  trace,
  parsedMetadata,
  projectId,
  traceScores,
  commentCount,
  commentDrawerControl,
}: TraceDetailViewHeaderProps) {
  const { isAnnotationMode } = useViewPreferences();
  const { isV4 } = useReadPath();
  const isMobile = useIsMobile();
  const [isMobileActionsOpen, setMobileActionsOpen] = useState(false);
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
        <div className="flex w-full min-w-0 flex-row items-center gap-1">
          <ItemBadge type="TRACE" isSmall />
          <span
            className={cn("min-w-0 truncate font-bold", isMobile && "flex-1")}
            title={trace.name || trace.id}
          >
            {trace.name || trace.id}
          </span>
          <ConnectedDetailHeaderActionsMenuController
            idItems={[{ id: trace.id, name: "Trace ID" }]}
            projectId={projectId}
            webCallout={{
              traceId: trace.id,
              sessionId: trace.sessionId ?? null,
            }}
          >
            {({ getTriggerProps }) => (
              <Button
                aria-label="Options"
                className="mt-0.5 shrink-0"
                size="icon-xs"
                title="Options"
                variant="ghost"
                {...getTriggerProps()}
              >
                <EllipsisVertical className="h-4 w-4" />
              </Button>
            )}
          </ConnectedDetailHeaderActionsMenuController>
          {/* Mobile: collapse the action-button cluster into a `⋯` overflow of
              full-width labeled rows, next to the `⋮` utility menu. */}
          {isMobile && (
            <ConnectedTraceObservationAddToDropdownMenuController
              analyticsData={{ source: "TraceDetail", isV4 }}
              projectId={projectId}
              traceId={trace.id}
              variant="trace"
              input={trace.input}
              output={trace.output}
              metadata={trace.metadata}
            >
              {({ getTriggerProps }) => (
                <AnnotateDrawerController projectId={projectId}>
                  {({ disabled: annotationDisabled, openDrawer }) => (
                    <Popover
                      open={isMobileActionsOpen}
                      onOpenChange={setMobileActionsOpen}
                    >
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
                        onFocusOutside={(event) => {
                          // Keep the anchor mounted while a portaled action menu takes focus.
                          event.preventDefault();
                        }}
                        className="flex w-auto min-w-44 flex-col gap-0.5 p-1"
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start gap-2 font-normal"
                          {...getTriggerProps()}
                        >
                          <PlusIcon className="h-4 w-4" />
                          <span>Add to</span>
                          <ChevronDown className="ml-auto h-3 w-3" />
                        </Button>
                        {!isAnnotationMode && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={annotationDisabled}
                            className="w-full justify-start gap-2 font-normal"
                            onClick={() => {
                              setMobileActionsOpen(false);
                              openDrawer({
                                scoreTarget: {
                                  type: "trace",
                                  traceId: trace.id,
                                },
                                scores: traceScores,
                                analyticsData: {
                                  type: "trace",
                                  source: "TraceDetail",
                                  isV4,
                                },
                                scoreMetadata: {
                                  projectId,
                                  environment: trace.environment,
                                },
                              });
                            }}
                          >
                            {annotationDisabled ? (
                              <LockIcon className="h-3 w-3" />
                            ) : (
                              <SquarePen className="h-4 w-4" />
                            )}
                            <span className="text-sm">Annotate</span>
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={commentDrawerControl.disabled}
                          onClick={() => {
                            setMobileActionsOpen(false);
                            commentDrawerControl.openDrawer();
                          }}
                          className="w-full justify-start gap-2 font-normal"
                        >
                          {commentDrawerControl.disabled ? (
                            <MessageSquareOff className="text-muted-foreground h-4 w-4" />
                          ) : (
                            <MessageSquare className="h-4 w-4" />
                          )}
                          <span className="text-sm">Comments</span>
                          {!commentDrawerControl.disabled && commentCount ? (
                            <ActionButtonCountBadge count={commentCount} />
                          ) : null}
                        </Button>
                      </PopoverContent>
                    </Popover>
                  )}
                </AnnotateDrawerController>
              )}
            </ConnectedTraceObservationAddToDropdownMenuController>
          )}
        </div>
        {/* Action buttons (desktop inline cluster) */}
        {!isMobile && (
          <div className="flex h-full flex-wrap content-start items-start justify-start gap-0.5 @2xl:mr-1 @2xl:justify-end">
            <ConnectedTraceObservationAddToDropdownMenuController
              analyticsData={{ source: "TraceDetail", isV4 }}
              projectId={projectId}
              traceId={trace.id}
              variant="trace"
              input={trace.input}
              output={trace.output}
              metadata={trace.metadata}
            >
              {({ getTriggerProps }) => (
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1"
                  {...getTriggerProps()}
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  <span>Add to</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              )}
            </ConnectedTraceObservationAddToDropdownMenuController>
            {/* Hide annotation buttons in annotation mode (panel shown separately) */}
            {!isAnnotationMode && (
              <AnnotateDrawerController projectId={projectId}>
                {({ disabled, openDrawer }) => (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
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
                          isV4,
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
                  <span>Comments</span>
                  {!!commentCount ? (
                    <ActionButtonCountBadge count={commentCount} />
                  ) : null}
                </>
              )}
            </Button>
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
            {targetTraceId && (
              <TargetTraceBadge
                targetTraceId={targetTraceId}
                projectId={projectId}
              />
            )}
            {trace.environment && (
              <EnvironmentBadge environment={trace.environment} />
            )}
            {trace.release && <ReleaseBadge release={trace.release} />}
            {trace.version && <VersionBadge version={trace.version} />}
          </CollapsibleBadgeRow>
        )}
      </div>
    </div>
  );
});
