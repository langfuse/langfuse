import { prepareTraceAnnotation } from "@/src/features/scores/lib/prepareTraceAnnotation";
/**
 * TraceDetailViewHeader - Extracted header component for TraceDetailView
 *
 * Contains:
 * - Title row with EntityTitle, trace name, options menu
 * - Action buttons (Add to, Annotate, Comment)
 * - Metadata badges (timestamp, environment, release, version, target trace)
 * - Trace-level score chips
 *
 * Memoized to prevent unnecessary re-renders when tab state changes.
 */

import { memo, useRef } from "react";
import { useReadPath } from "@/src/features/events";
import {
  type TraceDomain,
  type ScoreDomain,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { EntityTitle } from "@/src/components/EntityTitle";
import { DetailViewHeaderShell } from "@/src/features/traces/components/DetailViewHeaderShell";
import { Badge } from "@/src/components/design-system/Badge/Badge";
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
  EllipsisVertical,
  LockIcon,
  MessageSquare,
  MessageSquareOff,
  MoreHorizontal,
  PlusIcon,
  SquarePen,
} from "lucide-react";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
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
  const mobileActionsTriggerRef = useRef<HTMLButtonElement>(null);
  const commentActionLabel = commentCount ? "Comments" : "Comment";
  const mobileCommentActionLabel =
    commentCount && !commentDrawerControl.disabled
      ? `${commentActionLabel} (${commentCount})`
      : commentActionLabel;
  const targetTraceId =
    trace.environment === LangfuseInternalTraceEnvironment.LLMJudge
      ? resolveEvalExecutionMetadata(parsedMetadata)
      : null;

  const preparedDate = buildLocalIsoDatePresentation({
    date: trace.timestamp,
    accuracy: "millisecond",
  });

  const timestampBadge = preparedDate && (
    <span className="contents font-mono">
      <Badge
        color="ghost"
        text={preparedDate.display}
        title={preparedDate.title}
      />
    </span>
  );

  return (
    <DetailViewHeaderShell>
      {/* Title row with actions */}
      <div className="grid w-full grid-cols-1 items-center gap-2 @md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex w-full min-w-0 flex-row items-center gap-2">
          <EntityTitle as="span" type="TRACE" title={trace.name || trace.id} />
          {!isMobile && (
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
                  <EllipsisVertical className="icon-sm text-icon-foreground" />
                </Button>
              )}
            </ConnectedDetailHeaderActionsMenuController>
          )}
          {isMobile && (
            <ConnectedTraceObservationAddToDropdownMenuController
              analyticsData={{ source: "TraceDetail", isV4 }}
              projectId={projectId}
              traceId={trace.id}
              variant="trace"
              input={trace.input}
              output={trace.output}
              metadata={trace.metadata}
              renderMenu={(addToItems) => (
                <AnnotateDrawerController projectId={projectId}>
                  {({ disabled: annotationDisabled, openDrawer }) => (
                    <ConnectedDetailHeaderActionsMenuController
                      idItems={[{ id: trace.id, name: "Trace ID" }]}
                      projectId={projectId}
                      webCallout={{
                        traceId: trace.id,
                        sessionId: trace.sessionId ?? null,
                      }}
                      renderMenu={(utilityItems) => (
                        <DropdownMenu
                          placement="bottom-end"
                          maxHeight="min(24rem, calc(100dvh - 2rem))"
                          items={[
                            ...(!isAnnotationMode
                              ? [
                                  {
                                    type: "item" as const,
                                    id: "annotate",
                                    title: "Annotate",
                                    icon: annotationDisabled
                                      ? LockIcon
                                      : SquarePen,
                                    disabled: annotationDisabled
                                      ? {
                                          reason:
                                            "You don't have permission to annotate.",
                                        }
                                      : undefined,
                                    onClick: () => {
                                      mobileActionsTriggerRef.current?.focus({
                                        preventScroll: true,
                                      });
                                      openDrawer(
                                        prepareTraceAnnotation({
                                          traceId: trace.id,
                                          projectId,
                                          environment: trace.environment,
                                          scores: traceScores,
                                          isV4,
                                        }),
                                      );
                                    },
                                  },
                                ]
                              : []),
                            {
                              type: "item",
                              id: "comments",
                              title: mobileCommentActionLabel,
                              icon: commentDrawerControl.disabled
                                ? MessageSquareOff
                                : MessageSquare,
                              disabled: commentDrawerControl.disabled
                                ? {
                                    reason:
                                      "You don't have permission to comment.",
                                  }
                                : undefined,
                              onClick: () => {
                                mobileActionsTriggerRef.current?.focus({
                                  preventScroll: true,
                                });
                                commentDrawerControl.openDrawer();
                              },
                            },
                            {
                              type: "submenu" as const,
                              id: "add-to",
                              title: "Add to",
                              icon: PlusIcon,
                              items: addToItems,
                            },
                            {
                              id: "review-actions-separator",
                              type: "separator",
                            },
                            ...utilityItems,
                          ]}
                        >
                          {({ getTriggerProps }) => (
                            <Button
                              variant="outline"
                              size="icon"
                              aria-label="More actions"
                              className="ml-auto shrink-0"
                              {...getTriggerProps({
                                ref: mobileActionsTriggerRef,
                              })}
                            >
                              <MoreHorizontal className="icon-base text-icon-foreground" />
                            </Button>
                          )}
                        </DropdownMenu>
                      )}
                    />
                  )}
                </AnnotateDrawerController>
              )}
            />
          )}
        </div>
        {/* Action buttons (desktop inline cluster) */}
        {!isMobile && (
          <div className="flex flex-wrap content-start items-center justify-start gap-0.5 @md:justify-end">
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
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  {...getTriggerProps()}
                >
                  <PlusIcon className="icon-base" />
                  <span>Add to</span>
                  <DropdownIndicator size="sm" nudge />
                </Button>
              )}
            </ConnectedTraceObservationAddToDropdownMenuController>
            {/* Hide annotation buttons in annotation mode (panel shown separately) */}
            {!isAnnotationMode && (
              <AnnotateDrawerController projectId={projectId}>
                {({ disabled, openDrawer }) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() =>
                      openDrawer(
                        prepareTraceAnnotation({
                          traceId: trace.id,
                          projectId,
                          environment: trace.environment,
                          scores: traceScores,
                          isV4,
                        }),
                      )
                    }
                  >
                    {disabled ? (
                      <LockIcon className="icon-base mr-1.5" />
                    ) : (
                      <SquarePen className="icon-base mr-1.5" />
                    )}
                    <span>Annotate</span>
                  </Button>
                )}
              </AnnotateDrawerController>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={commentDrawerControl.disabled}
              onClick={commentDrawerControl.openDrawer}
              className="gap-1"
            >
              {commentDrawerControl.disabled ? (
                <MessageSquareOff className="icon-base text-muted-foreground" />
              ) : (
                <>
                  <MessageSquare className="icon-base" />
                  <span>{commentActionLabel}</span>
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
        {/* Timestamp alone in annotation mode; otherwise first in the badge row */}
        {isAnnotationMode && timestampBadge}
        {!isAnnotationMode && (
          <CollapsibleBadgeRow>
            {timestampBadge}
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
    </DetailViewHeaderShell>
  );
});
