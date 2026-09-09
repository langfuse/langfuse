import { useEffect, useMemo, useRef, type UIEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  prepareSessionTimelineObservations,
  type PreparedSessionTimelineItem,
} from "@/src/features/annotation-queues/components/session/SessionConversationTimeline/fns/prepareSessionTimelineObservations";
import {
  SessionConversationTimelineTrace,
  type PreparedSessionConversationTimelineTraceState,
  type SessionObservation,
  type SessionObservationActions,
} from "@/src/features/annotation-queues/components/session/SessionConversationTimeline/components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import { SessionVirtualizedRow } from "@/src/features/annotation-queues/components/session/SessionVirtualizedRow";
import { type EventSessionTrace } from "@/src/features/annotation-queues/components/session/sessionDetailPageTypes";
import { useElementSize } from "@/src/hooks/useElementSize";
import { useVirtualizedScrollSpy } from "@/src/hooks/useVirtualizedScrollSpy";

const SESSION_TIMELINE_OVERSCAN = 5;
const observationIdentityByReference = new WeakMap<object, number>();
let nextObservationIdentity = 0;

const getObservationIdentity = (observation: SessionObservation) => {
  const existingIdentity = observationIdentityByReference.get(observation);
  if (existingIdentity !== undefined) return existingIdentity;

  const identity = nextObservationIdentity++;
  observationIdentityByReference.set(observation, identity);
  return identity;
};

export type SessionConversationTimelineItem = {
  trace: EventSessionTrace;
  turnNumber: number;
  observations: readonly SessionObservation[] | null | undefined;
};

export type SessionConversationTimelineObservationActions =
  SessionObservationActions;

export type SessionConversationTimelineScrollTarget = {
  traceId: string;
  observationId: string;
  requestId: number;
};

export function useSessionConversationTimelineController(
  traces: readonly Pick<SessionConversationTimelineItem, "trace">[],
) {
  const items = traces.map(({ trace }) => trace);
  const [feedRef, feedSize] = useElementSize<HTMLDivElement>();
  const virtualizer = useVirtualizer({
    count: traces.length,
    getScrollElement: () => feedRef.current,
    estimateSize: () => 520,
    overscan: SESSION_TIMELINE_OVERSCAN,
    getItemKey: (index) => traces[index]?.trace.id ?? index,
  });
  const {
    activeItemId,
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

  const onSelect = (index: number, observationId?: string) => {
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

  return {
    activeTraceId: activeItemId ?? null,
    feedRef,
    onSelect,
    virtualItems,
    virtualizer,
  };
}

export type SessionConversationTimelineController = ReturnType<
  typeof useSessionConversationTimelineController
>;

export function SessionConversationTimeline({
  traces,
  filterMeasurementKey,
  emptyMessage,
  onOpenTrace,
  onOpenObservation,
  controller,
  observationActions,
  scrollTarget,
  onLoadMoreObservations,
}: {
  traces: readonly SessionConversationTimelineItem[];
  filterMeasurementKey: string;
  emptyMessage: string;
  onOpenTrace: (trace: EventSessionTrace) => void;
  onOpenObservation: (trace: EventSessionTrace, observationId: string) => void;
  controller: SessionConversationTimelineController;
  observationActions?: SessionConversationTimelineObservationActions;
  scrollTarget?: SessionConversationTimelineScrollTarget | null;
  onLoadMoreObservations?: () => void;
}) {
  const observationFingerprint = traces
    .flatMap(({ observations }) => observations ?? [])
    .map(getObservationIdentity)
    .join(",");
  const { states } = useMemo(() => {
    const preparedObservations = prepareSessionTimelineObservations(
      traces.flatMap(({ observations }) => observations ?? []),
    );
    const traceIndexByObservation = new Map<SessionObservation, number>();
    traces.forEach(({ observations }, traceIndex) => {
      observations?.forEach((observation) => {
        traceIndexByObservation.set(observation, traceIndex);
      });
    });
    const preparedObservationGroups: Array<
      PreparedSessionTimelineItem<SessionObservation>[] | null | undefined
    > = traces.map(({ observations }) =>
      observations === undefined || observations === null ? observations : [],
    );
    preparedObservations.forEach((preparedObservation) => {
      const traceIndex = traceIndexByObservation.get(
        preparedObservation.observation,
      );
      if (traceIndex === undefined) return;

      preparedObservationGroups[traceIndex]?.push(preparedObservation);
    });

    return {
      observationFingerprint,
      states: traces.map(
        (
          { observations },
          traceIndex,
        ): PreparedSessionConversationTimelineTraceState => {
          if (observations === undefined) return { type: "loading" };
          if (observations === null) return { type: "error" };
          if (observations.length === 0) {
            return { type: "empty", message: emptyMessage };
          }

          return {
            type: "loaded",
            observations: preparedObservationGroups[traceIndex] ?? [],
          };
        },
      ),
    };
  }, [emptyMessage, observationFingerprint, traces]);

  return (
    <SessionConversationTimelineFeed
      traces={traces}
      states={states}
      filterMeasurementKey={filterMeasurementKey}
      onOpenTrace={onOpenTrace}
      onOpenObservation={onOpenObservation}
      controller={controller}
      observationActions={observationActions}
      scrollTarget={scrollTarget ?? null}
      onLoadMoreObservations={onLoadMoreObservations}
    />
  );
}

function SessionConversationTimelineFeed({
  traces,
  states,
  filterMeasurementKey,
  onOpenTrace,
  onOpenObservation,
  controller,
  observationActions,
  scrollTarget,
  onLoadMoreObservations,
}: {
  traces: readonly SessionConversationTimelineItem[];
  states: readonly PreparedSessionConversationTimelineTraceState[];
  filterMeasurementKey: string;
  onOpenTrace: (trace: EventSessionTrace) => void;
  onOpenObservation: (trace: EventSessionTrace, observationId: string) => void;
  controller: SessionConversationTimelineController;
  observationActions?: SessionConversationTimelineObservationActions;
  scrollTarget: SessionConversationTimelineScrollTarget | null;
  onLoadMoreObservations?: () => void;
}) {
  const { feedRef, virtualItems, virtualizer } = controller;
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!onLoadMoreObservations) return;

    const { clientHeight, scrollTop } = event.currentTarget;
    const viewportBottom = scrollTop + clientHeight;
    const visibleTrace = virtualItems.findLast(
      (virtualItem) => virtualItem.start < viewportBottom,
    );
    const loadMoreThreshold = visibleTrace
      ? Math.min(240, visibleTrace.size / 4)
      : 0;
    if (
      visibleTrace &&
      viewportBottom >= visibleTrace.end - loadMoreThreshold
    ) {
      onLoadMoreObservations();
    }
  };

  return (
    <div
      ref={feedRef}
      aria-label="Session conversation timeline"
      className="h-full min-h-0 overflow-y-auto scroll-smooth"
      onScroll={handleScroll}
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
              <SessionConversationTimelineTrace
                trace={trace}
                turnNumber={turnNumber}
                state={state}
                onOpenTrace={() => onOpenTrace(trace)}
                onOpenObservation={(observationId) =>
                  onOpenObservation(trace, observationId)
                }
                observationActions={observationActions}
                scrollTarget={
                  scrollTarget?.traceId === trace.id ? scrollTarget : null
                }
              />
            </SessionVirtualizedRow>
          );
        })}
      </div>
    </div>
  );
}
