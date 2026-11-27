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
import { traceTopicRows } from "@/src/features/topics/trace/trace-topic-rows";
import { treemapBadgeColor } from "@/src/features/topics/topic-map-colors";
/** Trace totals, session/user links and tags, above the panels. */

import { useMemo } from "react";

import { PendingTraceDeletionBanner } from "@/src/features/traces/components/PendingTraceDeletionBanner";
import { usePendingTraceDeletions } from "@/src/features/traces/usePendingTraceDeletions";
import {
  traceDeleteCandidateFromObservation,
  traceDeleteCandidateFromTrace,
} from "@/src/features/traces/pendingTraceDeletionMatch";
import {
  useTraceData,
  useSingleTraceData,
} from "@/src/features/traces/contexts/TraceDataProvider";
import { useTracePresentation } from "@/src/features/traces/contexts/TracePresentationProvider";
import { aggregateTraceMetrics } from "@/src/features/traces/fns/traceAggregation";
import { useTraceTopicFacets } from "@/src/features/topics/trace/useTraceTopicFacets";
import { PlusIcon, SquarePen, MessageSquare } from "@langfuse/icons";
import { AnnotationQueueObjectType } from "@langfuse/shared";
import { type DropdownMenuItemDefinition } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { AnnotateDrawerController } from "@/src/features/scores/components/AnnotateDrawerController";
import { CommentDrawerController } from "@/src/features/comments/CommentDrawerController";
import { ConnectedAnnotationQueueSubmenuItemController } from "@/src/features/annotation-queues/components/ConnectedAnnotationQueueSubmenuItemController";
import { useViewPreferences } from "../contexts/ViewPreferencesProvider";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { useSessionScopeHeaderData } from "@/src/features/traces/hooks/useSessionScopeHeaderData";
import { useTraceHeaderWorkflowData } from "@/src/features/traces/hooks/useTraceHeaderWorkflowData";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { prepareTraceAnnotation } from "@/src/features/scores/lib/prepareTraceAnnotation";
import { ConnectedTraceObservationAddToDropdownMenuController } from "@/src/features/traces/components/ConnectedTraceObservationAddToDropdownMenuController";
import { SessionHeaderMetricsControl } from "@/src/features/sessions/SessionHeaderMetricsControl/SessionHeaderMetricsControl";
import { SessionMetadataJsonPathControl } from "@/src/features/sessions/SessionMetadataJsonPathControl";
import { getTraceSessionLinkMetric } from "../fns/getTraceSessionLinkMetric";

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
  return <ScopedTraceHeader header={header} />;
}

function ScopedTraceHeader({
  header,
}: Pick<React.ComponentProps<typeof TraceHeader>, "header">) {
  const { scope } = useTraceData();
  if (scope.type === "session")
    return (
      <ConnectedSessionScopeHeader
        header={header}
        sessionId={scope.sessionId}
      />
    );
  return <LoadedTraceHeader header={header} />;
}

function ConnectedSessionScopeHeader({
  header,
  sessionId,
}: Pick<React.ComponentProps<typeof TraceHeader>, "header"> & {
  sessionId: string;
}) {
  const { projectId, isPlaceholderData } = useTraceData();
  const { session, traces, filters } = useSessionScopeHeaderData({
    projectId,
    sessionId,
  });

  return (
    <ConnectedTraceHeaderWorkflowActions header={header}>
      {(configuredHeader) => {
        if (!session.data)
          return (
            <ObservabilityEntityDetailHeader
              {...configuredHeader}
              metrics={[]}
              isLoading
            />
          );
        const data = session.data;
        return (
          <SessionMetadataJsonPathControl
            key={`${projectId}:${sessionId}`}
            projectId={projectId}
            sessionId={sessionId}
            traces={
              traces.isSuccess
                ? { state: "loaded", data: traces.data }
                : { state: "loading" }
            }
            filterState={filters}
          >
            {(metadataJsonPaths) => (
              <SessionHeaderMetricsControl
                projectId={projectId}
                countTraces={data.countTraces}
                minTimestamp={data.minTimestamp}
                maxTimestamp={data.maxTimestamp}
                tokensIn={data.inputUsage}
                tokensOut={data.outputUsage}
                totalTokens={data.totalTokens}
                totalCost={data.totalCost ?? 0}
                users={data.users ?? []}
                scores={data.scores}
                metadataJsonPaths={metadataJsonPaths}
              >
                {(metrics) => (
                  <ObservabilityEntityDetailHeader
                    {...configuredHeader}
                    metrics={metrics}
                    isPlaceholderData={isPlaceholderData}
                  />
                )}
              </SessionHeaderMetricsControl>
            )}
          </SessionMetadataJsonPathControl>
        );
      }}
    </ConnectedTraceHeaderWorkflowActions>
  );
}

function LoadedTraceHeader({
  header,
}: Pick<React.ComponentProps<typeof TraceHeader>, "header">) {
  const { trace, observations, mergedScores, corrections, isPlaceholderData } =
    useSingleTraceData();
  const unifiedTraceSessionViewEnabled = useIsFeatureEnabled(
    "unifiedTraceSessionView",
    { projectId: trace.projectId },
  );
  const { isV4 } = useReadPath();
  const isProjectMember = useIsAuthenticatedAndProjectMember(trace.projectId);
  const { traceContext } = useViewPreferences();
  const topicFacets = useTraceTopicFacets(trace);

  const aggregatedMetrics = useMemo(
    () => aggregateTraceMetrics(observations),
    [observations],
  );
  const latency = trace.latency;

  const traceScores = useMemo(
    () => mergedScores.filter((score) => score.observationId === null),
    [mergedScores],
  );

  const { isEmbedded } = useTracePresentation();
  const tags = trace.tags;
  const pendingTraceDeletions = usePendingTraceDeletions(trace.projectId);
  const scheduledForDeletion = useMemo(
    () =>
      pendingTraceDeletions.isTracePending(trace.id, {
        traces: [traceDeleteCandidateFromTrace(trace)],
        events: observations.flatMap((observation) => {
          if (observation.traceId !== trace.id) return [];
          const candidate = traceDeleteCandidateFromObservation(observation);
          return candidate ? [candidate] : [];
        }),
      }),
    [pendingTraceDeletions, trace, observations],
  );
  const metrics: HeaderMetric[] = [];
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
  const sessionMetric = getTraceSessionLinkMetric({
    projectId: trace.projectId,
    header,
    unifiedTraceSessionViewEnabled,
    isV4,
    isProjectMember,
    sessionId: trace.sessionId,
    context: traceContext,
    aggregation: undefined,
  });
  if (sessionMetric) metrics.push(sessionMetric);
  if (trace.userId)
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
      color: lead ? treemapBadgeColor(lead.topicIndex) : undefined,
      title: "Topics",
      href: `/project/${encodeURIComponent(trace.projectId)}/topics`,
      linkText: "Open in Topics →",
      searchText: topicFacets
        .map(
          (facet) =>
            `${facet.name} ${facet.topicName ?? ""} ${facet.summary ?? ""}`,
        )
        .join(" "),
      rows: traceTopicRows(topicFacets),
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
          metrics={isEmbedded ? [] : metrics}
          isPlaceholderData={isPlaceholderData}
          notice={
            scheduledForDeletion ? <PendingTraceDeletionBanner /> : undefined
          }
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
  const { trace, projectId, scope, mergedScores, isPlaceholderData } =
    useTraceData();
  const { isAnnotationMode } = useViewPreferences();
  const { isV4 } = useReadPath();
  const unifiedTraceSessionViewEnabled = useIsFeatureEnabled(
    "unifiedTraceSessionView",
    { projectId },
  );
  const isMember = useIsAuthenticatedAndProjectMember(projectId);
  const sessionId = scope.type === "session" ? scope.sessionId : null;
  const objectId = sessionId ?? trace?.id ?? "";
  const objectType = sessionId ? ("SESSION" as const) : ("TRACE" as const);
  const { session, counts } = useTraceHeaderWorkflowData({
    projectId,
    sessionId,
    objectId,
    objectType,
    isMember,
  });
  const count = Number(counts.data?.get(objectId) ?? 0);
  // The unified view can show an observation instead of the trace detail pane.
  if (!sessionId && (!unifiedTraceSessionViewEnabled || !isV4))
    return children(header);
  const renderHeader = (
    items: DropdownMenuItemDefinition[],
    totalCount: number | undefined,
  ) => (
    <AnnotateDrawerController projectId={projectId}>
      {({ disabled: annotationDisabled, openDrawer: annotate }) => (
        <CommentDrawerController
          projectId={projectId}
          count={count}
          onCommentChange={() => counts.refetch().then(() => {})}
        >
          {({ disabled: commentDisabled, openDrawer: comment }) => {
            const openAnnotation = () => {
              if (!sessionId) {
                if (!trace) return;
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
                  projectId,
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
                objectStartTime: sessionId ? undefined : trace?.timestamp,
              });
            const commentLabel = count > 0 ? "Comments" : "Comment";
            const annotationUnavailable =
              annotationDisabled ||
              isPlaceholderData ||
              (!!sessionId && !session.data);
            const workflowActions: EntityDetailHeaderAction[] = [
              {
                id: JSON.stringify([
                  "add-to",
                  trace?.id,
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
                      count: sessionId
                        ? session.data?.scores.filter(
                            (score) => score.source === "ANNOTATION",
                          ).length
                        : undefined,
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
                count,
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
  if (!sessionId && trace)
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
    <ConnectedAnnotationQueueSubmenuItemController
      projectId={projectId}
      objectId={sessionId ?? ""}
      objectType={AnnotationQueueObjectType.SESSION}
      analyticsData={{ source: "SessionDetail", isV4 }}
    >
      {({ item, totalCount }) => renderHeader([item], totalCount)}
    </ConnectedAnnotationQueueSubmenuItemController>
  );
}
