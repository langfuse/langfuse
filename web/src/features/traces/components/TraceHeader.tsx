import {
  ObservabilityEntityDetailHeader,
  type HeaderMetric,
  type EntityDetailHeaderConfiguration,
  type EntityDetailHeaderAction,
} from "@/src/components/ObservabilityEntityDetailHeader/ObservabilityEntityDetailHeader";
import { groupScoresByName } from "@/src/components/GroupedScoreBadges";
import {
  formatMetricCost,
  formatMetricTokens,
  hasBreakdown,
} from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { treemapBadgeColor } from "@/src/features/topics/topic-map-colors";
/** Trace totals, session/user links and tags, above the panels. */

import { useMemo } from "react";

import { useTraceData } from "@/src/features/traces/contexts/TraceDataProvider";
import { aggregateTraceMetrics } from "@/src/features/traces/fns/traceAggregation";
import { useTraceTopicFacets } from "@/src/features/topics/trace/useTraceTopicFacets";
import { PlusIcon, SquarePen, MessageSquare } from "@langfuse/icons";
import { AnnotationQueueObjectType } from "@langfuse/shared";
import { type DropdownMenuItemDefinition } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { AnnotateDrawerController } from "@/src/features/scores/components/AnnotateDrawerController";
import { CommentDrawerController } from "@/src/features/comments/CommentDrawerController";
import { AnnotationQueueSubmenuItemController } from "@/src/features/annotation-queues/components/AnnotationQueueSubmenuItemController";
import { useViewPreferences } from "../contexts/ViewPreferencesProvider";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { api } from "@/src/utils/api";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { prepareTraceAnnotation } from "@/src/features/scores/lib/prepareTraceAnnotation";
import { ConnectedTraceObservationAddToDropdownMenuController } from "@/src/features/traces/components/ConnectedTraceObservationAddToDropdownMenuController";

export function TraceHeader({
  isLoading = false,
  header,
}: {
  isLoading?: boolean;
  header: EntityDetailHeaderConfiguration;
}) {
  if (isLoading) {
    return (
      <ObservabilityEntityDetailHeader {...header} metrics={[]} isLoading />
    );
  }
  return <LoadedTraceHeader header={header} />;
}

function LoadedTraceHeader({
  header,
}: Pick<React.ComponentProps<typeof TraceHeader>, "header">) {
  const {
    trace,
    observations,
    mergedScores,
    corrections,
    sessionTraces,
    isPlaceholderData,
  } = useTraceData();
  const topicFacets = useTraceTopicFacets(trace);

  const aggregatedMetrics = useMemo(
    () => aggregateTraceMetrics(observations),
    [observations],
  );
  const latency = useMemo(() => {
    if (!sessionTraces) return trace.latency;
    if (observations.length === 0) return undefined;
    let first = Infinity;
    let last = -Infinity;
    for (const observation of observations) {
      first = Math.min(first, observation.startTime.getTime());
      last = Math.max(
        last,
        (observation.endTime ?? observation.startTime).getTime(),
      );
    }
    return (last - first) / 1000;
  }, [sessionTraces, trace.latency, observations]);

  const traceScores = useMemo(
    () => mergedScores.filter((score) => score.observationId === null),
    [mergedScores],
  );

  const tags = sessionTraces
    ? [...new Set(sessionTraces.flatMap((entry) => entry.tags))]
    : trace.tags;
  const metrics: HeaderMetric[] = [];
  if (sessionTraces)
    metrics.push({
      id: "traces",
      type: "value",
      text: `${sessionTraces.length} traces`,
      searchText: `traces ${sessionTraces.length}`,
    });
  if (latency != null)
    metrics.push({
      id: "latency",
      type: "value",
      text: formatIntervalSeconds(latency),
      searchText: `latency ${latency}`,
    });
  if (aggregatedMetrics.totalCost != null && aggregatedMetrics.costDetails) {
    const text = formatMetricCost(aggregatedMetrics.totalCost);
    const title = `exact $${aggregatedMetrics.totalCost.toFixed(6)}`;
    if (hasBreakdown(aggregatedMetrics.costDetails)) {
      metrics.push({
        id: "cost",
        type: "cost",
        text,
        title,
        details: aggregatedMetrics.costDetails,
        searchText: `cost ${aggregatedMetrics.totalCost}`,
      });
    } else {
      metrics.push({
        id: "cost",
        type: "value",
        text,
        title,
        searchText: `cost ${aggregatedMetrics.totalCost}`,
      });
    }
  }
  if (
    aggregatedMetrics.hasGenerationLike &&
    aggregatedMetrics.totalUsage > 0 &&
    aggregatedMetrics.usageDetails &&
    hasBreakdown(aggregatedMetrics.usageDetails)
  )
    metrics.push({
      id: "usage",
      type: "tokens",
      text: formatMetricTokens(aggregatedMetrics.totalUsage),
      details: aggregatedMetrics.usageDetails,
      searchText: `tokens ${aggregatedMetrics.totalUsage}`,
    });
  if (trace.sessionId)
    metrics.push({
      id: "session",
      type: "link",
      href: `/project/${trace.projectId}/sessions/${encodeURIComponent(trace.sessionId)}`,
      text: "session",
      searchText: `session ${trace.sessionId}`,
    });
  if (!sessionTraces && trace.userId)
    metrics.push({
      id: "user",
      type: "link",
      href: `/project/${trace.projectId}/users/${encodeURIComponent(trace.userId)}`,
      text: trace.userId,
      label: "user",
      searchText: `user ${trace.userId}`,
    });
  if (topicFacets.some((facet) => facet.summary)) {
    const assigned = topicFacets.filter((facet) => facet.topicName);
    const lead = assigned[0];
    const text = lead?.topicName
      ? `${lead.topicName}${assigned.length > 1 ? ` +${assigned.length - 1}` : ""}`
      : "Topics";
    metrics.push({
      id: "topics",
      type: "details",
      text,
      title: "Topics",
      href: `/project/${encodeURIComponent(trace.projectId)}/topics`,
      linkText: "Open in Topics →",
      searchText: topicFacets
        .map(
          (facet) =>
            `${facet.name} ${facet.topicName ?? ""} ${facet.summary ?? ""}`,
        )
        .join(" "),
      rows: topicFacets.map((facet) => ({
        id: facet.facetId,
        label: facet.name,
        value:
          facet.topicName ??
          facet.outcome?.replaceAll("_", " ") ??
          "Not analyzed yet",
        description: facet.summary ?? undefined,
        color: facet.topicName ? treemapBadgeColor(facet.topicIndex) : "filled",
      })),
    });
  }
  for (const [name, scores] of Object.entries(groupScoresByName(traceScores)))
    metrics.push({
      id: `score-${name}`,
      type: "score",
      name,
      scores,
      searchText: scores
        .map(
          (score) =>
            `score ${score.name} ${score.stringValue ?? score.value ?? "—"}`,
        )
        .join(" "),
    });
  // CORRECTIONs stay out of mergedScores; presence comes from corrections only.
  if (corrections.some((correction) => !correction.observationId))
    metrics.push({
      id: "corrected",
      type: "correction",
      searchText: "corrected",
    });
  tags.forEach((tag, index) =>
    metrics.push({
      id: `tag-${tag}`,
      type: "value",
      text: tag,
      color: "filled",
      searchText: `tag ${tag}`,
      overflowOnly: index >= 3,
    }),
  );
  return (
    <ConnectedTraceHeaderWorkflowActions header={header}>
      {(configuredHeader) => (
        <ObservabilityEntityDetailHeader
          {...configuredHeader}
          metrics={metrics}
          isPlaceholderData={isPlaceholderData}
        />
      )}
    </ConnectedTraceHeaderWorkflowActions>
  );
}

function ConnectedTraceHeaderWorkflowActions({
  header,
  children,
}: {
  header: EntityDetailHeaderConfiguration;
  children: (props: EntityDetailHeaderConfiguration) => React.ReactNode;
}) {
  const { trace, mergedScores, isPlaceholderData } = useTraceData();
  const { isAnnotationMode } = useViewPreferences();
  const { isV4 } = useReadPath();
  const unifiedTraceSessionViewEnabled = useIsFeatureEnabled(
    "unifiedTraceSessionView",
    { projectId: trace.projectId },
  );
  const isMember = useIsAuthenticatedAndProjectMember(trace.projectId);
  const sessionId =
    header.headerProps.itemType === "SESSION" ? trace.sessionId : null;
  const session = api.sessions.byIdWithScoresFromEvents.useQuery(
    { projectId: trace.projectId, sessionId: sessionId ?? "" },
    { enabled: !!sessionId && isMember },
  );
  const objectId = sessionId ?? trace.id;
  const objectType = sessionId ? ("SESSION" as const) : ("TRACE" as const);
  const counts = api.comments.getCountByObjectId.useQuery(
    { projectId: trace.projectId, objectId, objectType },
    { enabled: isMember, refetchOnMount: false },
  );
  const count = Number(counts.data?.get(objectId) ?? 0);
  // The unified view can show an observation instead of the trace detail pane.
  if (!sessionId && (!unifiedTraceSessionViewEnabled || !isV4))
    return children(header);
  const renderHeader = (
    items: DropdownMenuItemDefinition[],
    totalCount: number | undefined,
  ) => (
    <AnnotateDrawerController projectId={trace.projectId}>
      {({ disabled: annotationDisabled, openDrawer: annotate }) => (
        <CommentDrawerController
          projectId={trace.projectId}
          count={count}
          onCommentChange={() => counts.refetch().then(() => {})}
        >
          {({ disabled: commentDisabled, openDrawer: comment }) => {
            const openAnnotation = () => {
              if (!sessionId) {
                annotate(
                  prepareTraceAnnotation({
                    traceId: trace.id,
                    projectId: trace.projectId,
                    environment: trace.environment,
                    scores: mergedScores,
                    isV4,
                  }),
                );
                return;
              }
              if (!session.data) return;
              annotate({
                scoreTarget: { type: "session", sessionId },
                scores: session.data.scores,
                scoreMetadata: {
                  projectId: trace.projectId,
                  environment: session.data.environment,
                },
                analyticsData: {
                  type: "session",
                  source: "SessionDetail",
                  isV4,
                },
              });
            };
            const openComments = () =>
              comment({
                type: "comments",
                objectId,
                objectType,
                objectStartTime: sessionId ? undefined : trace.timestamp,
              });
            const commentLabel = count > 0 ? `Comments (${count})` : "Comment";
            const annotationUnavailable =
              annotationDisabled ||
              isPlaceholderData ||
              (!!sessionId && !session.data);
            const workflowActions: EntityDetailHeaderAction[] = [
              {
                id: JSON.stringify([
                  "add-to",
                  trace.id,
                  sessionId,
                  isPlaceholderData,
                ]),
                type: "dropdown",
                label: "Add to",
                icon: PlusIcon,
                items,
                count: totalCount,
                disabled: isPlaceholderData || !isMember,
              },
              ...(!isAnnotationMode
                ? [
                    {
                      id: "annotate",
                      type: "button",
                      label: "Annotate",
                      icon: SquarePen,
                      disabled: annotationUnavailable,
                      onClick: openAnnotation,
                    } satisfies EntityDetailHeaderAction,
                  ]
                : []),
              {
                id: "comment",
                type: "button",
                label: commentLabel,
                icon: MessageSquare,
                disabled: commentDisabled || isPlaceholderData,
                onClick: openComments,
              },
            ];
            if (header.variant === "peek")
              return children({
                ...header,
                headerProps: {
                  ...header.headerProps,
                  actions: [...workflowActions, ...header.headerProps.actions],
                },
              });
            return children({
              ...header,
              headerProps: {
                ...header.headerProps,
                actions: [
                  ...workflowActions,
                  ...(header.headerProps.actions ?? []),
                ],
              },
            });
          }}
        </CommentDrawerController>
      )}
    </AnnotateDrawerController>
  );
  if (!sessionId)
    return (
      <ConnectedTraceObservationAddToDropdownMenuController
        projectId={trace.projectId}
        traceId={trace.id}
        variant="trace"
        input={trace.input}
        output={trace.output}
        metadata={trace.metadata}
        analyticsData={{ source: "TraceDetail", isV4 }}
        renderMenu={(items) => renderHeader(items, undefined)}
      />
    );
  return (
    <AnnotationQueueSubmenuItemController
      projectId={trace.projectId}
      objectId={sessionId}
      objectType={AnnotationQueueObjectType.SESSION}
      analyticsData={{ source: "SessionDetail", isV4 }}
    >
      {({ item, totalCount }) => renderHeader([item], totalCount)}
    </AnnotationQueueSubmenuItemController>
  );
}
