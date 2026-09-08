import { useEffect, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type FilterState } from "@langfuse/shared";

import {
  PreparedSessionConversationTimeline,
  type PreparedSessionConversationTimelineState,
  type SessionObservation,
  type SessionObservationActions,
} from "@/src/components/session/SessionConversationTimeline/SessionConversationTimeline";
import {
  prepareSessionTimelineObservations,
  type PreparedSessionTimelineItem,
} from "@/src/components/session/SessionConversationTimeline/fns/prepareSessionTimelineObservations";
import { SessionVirtualizedRow } from "@/src/components/session/SessionVirtualizedRow";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { useElementSize } from "@/src/hooks/useElementSize";
import { useVirtualizedScrollSpy } from "@/src/hooks/useVirtualizedScrollSpy";
import { api, sendAsPostOption, type RouterOutputs } from "@/src/utils/api";
import { AnnotateDrawerController } from "@/src/features/scores/components/AnnotateDrawerController";
import { CommentDrawerController } from "@/src/features/comments/CommentDrawerController";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets/components/NewDatasetItemFromExistingObjectDialogController";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useHasProjectAccess } from "@/src/features/rbac";

const BATCH_IO_SIZE = 500;
const SESSION_TIMELINE_OVERSCAN = 5;

type EventObservation = RouterOutputs["events"]["all"]["observations"][number];

const getObservationKey = (traceId: string, observationId: string) =>
  `${traceId}\0${observationId}`;

export type SessionConversationTimelineTrace = {
  trace: EventSessionTrace;
  turnNumber: number;
  observations: EventObservation[] | null | undefined;
};

type TimelineNavigation = {
  activeTraceId: string | null;
  onSelect: (index: number, observationId?: string) => void;
};

type ObservationActionTarget = {
  action: "annotate" | "comment" | "dataset";
  observation: SessionObservation;
  trace: EventSessionTrace;
  requestId: number;
};

function ConnectedObservationAction({
  projectId,
  target,
  onOpenChange,
}: {
  projectId: string;
  target: ObservationActionTarget;
  onOpenChange: (open: boolean) => void;
}) {
  const { action, observation, trace } = target;

  if (action === "annotate") {
    return (
      <AnnotateDrawerController
        key={target.requestId}
        projectId={projectId}
        scoreTarget={{
          type: "trace",
          traceId: trace.id,
          observationId: observation.id,
        }}
        scores={trace.scores.filter(
          (score) => score.observationId === observation.id,
        )}
        analyticsData={{ type: "trace", source: "SessionDetail" }}
        scoreMetadata={{
          projectId,
          environment: trace.environment ?? undefined,
        }}
        isOpen
        onOpenChange={onOpenChange}
      >
        {() => <span className="hidden" aria-hidden="true" />}
      </AnnotateDrawerController>
    );
  }

  if (action === "comment") {
    return (
      <CommentDrawerController
        key={target.requestId}
        projectId={projectId}
        objectId={observation.id}
        objectType="OBSERVATION"
        isOpen
        onOpenChange={onOpenChange}
      >
        {() => <span className="hidden" aria-hidden="true" />}
      </CommentDrawerController>
    );
  }

  return (
    <NewDatasetItemFromExistingObjectDialogController
      key={target.requestId}
      projectId={projectId}
      traceId={trace.id}
      observationId={observation.id}
      input={observation.input}
      output={observation.output}
      metadata={observation.metadata}
      isOpen
      onOpenChange={onOpenChange}
    >
      {() => <span className="hidden" aria-hidden="true" />}
    </NewDatasetItemFromExistingObjectDialogController>
  );
}

export function ConnectedSessionConversationTimeline({
  traces,
  projectId,
  sessionId,
  filterState,
  filterMeasurementKey,
  viewLabel,
  openPeek,
  renderSidebar,
  onFilterObservationByName,
}: {
  traces: readonly SessionConversationTimelineTrace[];
  projectId: string;
  sessionId: string;
  filterState: FilterState;
  filterMeasurementKey: string;
  viewLabel: string | null;
  openPeek: (
    id: string,
    row: EventSessionTrace & { observationId?: string },
  ) => void;
  renderSidebar: (navigation: TimelineNavigation) => ReactNode;
  onFilterObservationByName: (
    name: string,
    operator: "any of" | "none of",
  ) => void;
}) {
  const capture = usePostHogClientCapture();
  const canAnnotate = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });
  const canAddComment = useHasProjectAccess({
    projectId,
    scope: "comments:CUD",
  });
  const canAddToDataset = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });
  const [actionTarget, setActionTarget] =
    useState<ObservationActionTarget | null>(null);
  const observationRefs = traces.flatMap(
    ({ trace, observations }) =>
      observations?.map((observation) => ({
        observation,
        traceId: trace.id,
      })) ?? [],
  );
  const batches: (typeof observationRefs)[] = [];
  for (let index = 0; index < observationRefs.length; index += BATCH_IO_SIZE) {
    batches.push(observationRefs.slice(index, index + BATCH_IO_SIZE));
  }

  const ioQueries = api.useQueries((t) =>
    batches.map((batch) => {
      const timestamps = batch.map(({ observation }) =>
        observation.startTime.getTime(),
      );
      return t.events.sessionBatchIO(
        {
          projectId,
          sessionId,
          observations: batch.map(({ observation, traceId }) => ({
            id: observation.id,
            traceId,
          })),
          minStartTime: new Date(Math.min(...timestamps)),
          maxStartTime: new Date(Math.max(...timestamps)),
          truncated: false,
          ioCharLimit: 10_000,
        },
        {
          ...sendAsPostOption,
          staleTime: 60 * 1000,
          refetchOnWindowFocus: false,
        },
      );
    }),
  );

  const ioByObservationKey = new Map<
    string,
    RouterOutputs["events"]["sessionBatchIO"][number]
  >();
  const queryIndexByObservationKey = new Map<string, number>();
  batches.forEach((batch, queryIndex) => {
    batch.forEach(({ observation, traceId }) => {
      const observationKey = getObservationKey(traceId, observation.id);
      queryIndexByObservationKey.set(observationKey, queryIndex);
    });
    for (const io of ioQueries[queryIndex]?.data ?? []) {
      ioByObservationKey.set(getObservationKey(io.traceId, io.id), io);
    }
  });

  const hydratedObservationGroups = traces.map(({ trace, observations }) => {
    if (observations === undefined || observations === null)
      return observations;

    const queryIndices = new Set(
      observations.flatMap((observation) => {
        const queryIndex = queryIndexByObservationKey.get(
          getObservationKey(trace.id, observation.id),
        );
        return queryIndex === undefined ? [] : [queryIndex];
      }),
    );
    if (
      Array.from(queryIndices).some(
        (queryIndex) => ioQueries[queryIndex]?.isError,
      )
    ) {
      return null;
    }
    if (
      Array.from(queryIndices).some(
        (queryIndex) => ioQueries[queryIndex]?.isPending,
      )
    ) {
      return undefined;
    }

    return observations.map((observation) => {
      const io = ioByObservationKey.get(
        getObservationKey(trace.id, observation.id),
      );
      return {
        ...observation,
        input: io?.input ?? null,
        output: io?.output ?? null,
        metadata: io?.metadata ?? null,
      } satisfies SessionObservation;
    });
  });
  const preparedObservations = prepareSessionTimelineObservations(
    hydratedObservationGroups.flatMap((observations) => observations ?? []),
  );
  const groupIndexByObservation = new Map<SessionObservation, number>();
  hydratedObservationGroups.forEach((observations, groupIndex) => {
    observations?.forEach((observation) => {
      groupIndexByObservation.set(observation, groupIndex);
    });
  });
  const preparedObservationGroups: Array<
    PreparedSessionTimelineItem<SessionObservation>[] | null | undefined
  > = hydratedObservationGroups.map((observations) =>
    observations === undefined || observations === null ? observations : [],
  );
  preparedObservations.forEach((preparedObservation) => {
    const groupIndex = groupIndexByObservation.get(
      preparedObservation.observation,
    );
    if (groupIndex === undefined) return;

    preparedObservationGroups[groupIndex]?.push(preparedObservation);
  });
  const timelineStates = traces.map(
    (
      { observations },
      traceIndex,
    ): PreparedSessionConversationTimelineState => {
      const hydratedObservations = hydratedObservationGroups[traceIndex];
      const preparedGroup = preparedObservationGroups[traceIndex];
      if (observations === undefined || hydratedObservations === undefined) {
        return { type: "loading" };
      }
      if (observations === null || hydratedObservations === null) {
        return { type: "error" };
      }
      if (observations.length === 0) {
        return {
          type: "empty",
          message:
            filterState.length === 0
              ? "This trace has no observations."
              : viewLabel
                ? `No observation matches the “${viewLabel}” view in this trace.`
                : "No observation matches the current filters in this trace.",
        };
      }
      if (hydratedObservations.length === 0) return { type: "loading" };

      return {
        type: "loaded",
        observations: preparedGroup ?? [],
      };
    },
  );

  const openObservationAction = (
    action: ObservationActionTarget["action"],
    trace: EventSessionTrace,
    observation: SessionObservation,
  ) => {
    if (action === "annotate" && !canAnnotate) return;
    if (action === "comment" && !canAddComment) return;
    if (action === "dataset" && !canAddToDataset) return;

    if (action === "annotate") {
      const hasScores = trace.scores.some(
        (score) => score.observationId === observation.id,
      );
      capture(hasScores ? "score:update_form_open" : "score:create_form_open", {
        type: "trace",
        source: "SessionDetail",
      });
    }
    if (action === "dataset") {
      capture("dataset_item:new_from_trace_form_open", {
        object: "observation",
      });
    }

    setActionTarget((current) => ({
      action,
      trace,
      observation,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  };

  return (
    <>
      <SessionConversationTimelineFeed
        traces={traces}
        items={traces.map(({ trace }) => trace)}
        states={timelineStates}
        filterMeasurementKey={filterMeasurementKey}
        openPeek={openPeek}
        renderSidebar={renderSidebar}
        onFilterObservationByName={onFilterObservationByName}
        onObservationAction={openObservationAction}
        observationActionAccess={{
          canAnnotate,
          canAddComment,
          canAddToDataset,
        }}
      />
      {actionTarget ? (
        <ConnectedObservationAction
          key={actionTarget.requestId}
          projectId={projectId}
          target={actionTarget}
          onOpenChange={(open) => {
            if (!open) setActionTarget(null);
          }}
        />
      ) : null}
    </>
  );
}

function SessionConversationTimelineFeed({
  traces,
  items,
  states,
  filterMeasurementKey,
  openPeek,
  renderSidebar,
  onFilterObservationByName,
  onObservationAction,
  observationActionAccess,
}: {
  traces: readonly SessionConversationTimelineTrace[];
  items: EventSessionTrace[];
  states: readonly PreparedSessionConversationTimelineState[];
  filterMeasurementKey: string;
  openPeek: (
    id: string,
    row: EventSessionTrace & { observationId?: string },
  ) => void;
  renderSidebar: (navigation: TimelineNavigation) => ReactNode;
  onFilterObservationByName: SessionObservationActions["onFilterByName"];
  onObservationAction: (
    action: ObservationActionTarget["action"],
    trace: EventSessionTrace,
    observation: SessionObservation,
  ) => void;
  observationActionAccess: Pick<
    SessionObservationActions,
    "canAnnotate" | "canAddComment" | "canAddToDataset"
  >;
}) {
  const [feedRef, feedSize] = useElementSize<HTMLDivElement>();
  const virtualizer = useVirtualizer({
    count: traces.length,
    getScrollElement: () => feedRef.current,
    estimateSize: () => 520,
    overscan: SESSION_TIMELINE_OVERSCAN,
    getItemKey: (index) => traces[index]?.trace.id ?? index,
  });
  const {
    activeItemId: activeTraceId,
    virtualItems,
    selectItem: selectTrace,
  } = useVirtualizedScrollSpy({
    items,
    virtualizer,
    scrollElementRef: feedRef,
    viewportHeight: feedSize?.height ?? 0,
    endTransitionRatio: 0.2,
  });
  const observationScrollCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => observationScrollCleanupRef.current?.(), []);

  const handleSelect = (index: number, observationId?: string) => {
    observationScrollCleanupRef.current?.();
    observationScrollCleanupRef.current = null;
    selectTrace(index);
    if (!observationId) return;

    const feed = feedRef.current;
    const traceId = traces[index]?.trace.id;
    if (!feed || !traceId) return;

    const scrollToObservation = () => {
      const observation = Array.from(
        feed.querySelectorAll<HTMLElement>("[data-session-observation-id]"),
      ).find(
        (element) =>
          element.dataset.sessionObservationId === observationId &&
          element.closest<HTMLElement>("[data-session-trace-id]")?.dataset
            .sessionTraceId === traceId,
      );
      if (!observation) return false;

      const top =
        feed.scrollTop +
        observation.getBoundingClientRect().top -
        feed.getBoundingClientRect().top -
        Math.max(0, (feed.clientHeight - observation.clientHeight) / 2);
      feed.scrollTo({ top, behavior: "smooth" });
      return true;
    };

    if (scrollToObservation()) return;

    let timeout: number;
    const cleanup = () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
    const observer = new MutationObserver(() => {
      if (!scrollToObservation()) return;
      cleanup();
      if (observationScrollCleanupRef.current === cleanup) {
        observationScrollCleanupRef.current = null;
      }
    });
    observer.observe(feed, { childList: true, subtree: true });
    timeout = window.setTimeout(() => {
      cleanup();
      if (observationScrollCleanupRef.current === cleanup) {
        observationScrollCleanupRef.current = null;
      }
    }, 5_000);
    observationScrollCleanupRef.current = cleanup;
  };

  return (
    <div className="bg-background relative grid min-h-0 flex-1 grid-rows-[minmax(10rem,13rem)_minmax(0,1fr)] gap-x-4 overflow-hidden lg:grid-cols-[clamp(200px,24vw,296px)_minmax(0,1fr)] lg:grid-rows-1">
      {renderSidebar({ activeTraceId, onSelect: handleSelect })}
      <div className="bg-card dark:bg-background relative min-h-0 min-w-[320px]">
        <div
          ref={feedRef}
          className="h-full min-h-0 overflow-y-auto scroll-smooth"
        >
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((virtualItem) => {
              const timelineTrace = traces[virtualItem.index];
              const state = states[virtualItem.index];
              if (!timelineTrace || !state) return null;
              const { trace, turnNumber } = timelineTrace;

              return (
                <SessionVirtualizedRow
                  key={virtualItem.key}
                  itemKey={String(virtualItem.key)}
                  measurementKey={`${String(virtualItem.key)}:${filterMeasurementKey}`}
                  source="modern"
                  virtualItem={virtualItem}
                  virtualizer={virtualizer}
                >
                  <PreparedSessionConversationTimeline
                    trace={trace}
                    turnNumber={turnNumber}
                    state={state}
                    onOpenTrace={() => openPeek(trace.id, trace)}
                    onOpenObservation={(observationId) =>
                      openPeek(trace.id, { ...trace, observationId })
                    }
                    observationActions={{
                      ...observationActionAccess,
                      onFilterByName: onFilterObservationByName,
                      onAnnotate: (observation) =>
                        onObservationAction("annotate", trace, observation),
                      onAddComment: (observation) =>
                        onObservationAction("comment", trace, observation),
                      onAddToDataset: (observation) =>
                        onObservationAction("dataset", trace, observation),
                    }}
                  />
                </SessionVirtualizedRow>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
