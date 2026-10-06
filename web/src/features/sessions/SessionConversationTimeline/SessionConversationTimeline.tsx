import { type ComponentProps, type UIEvent } from "react";
import { SessionVirtualizedRow } from "@/src/features/sessions/SessionVirtualizedRow";
import { SessionConversationTimelineTrace } from "@/src/features/sessions/SessionConversationTimeline/components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import { type SessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";

export function SessionConversationTimeline({
  traces,
  filterMeasurementKey,
  controller,
  onLoadMoreObservations,
}: {
  traces: readonly ComponentProps<typeof SessionConversationTimelineTrace>[];
  filterMeasurementKey: string;
  controller: SessionConversationTimelineController;
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
          const traceProps = traces[virtualItem.index];
          if (!traceProps) return null;

          return (
            <SessionVirtualizedRow
              key={virtualItem.key}
              itemKey={String(virtualItem.key)}
              measurementKey={`${String(virtualItem.key)}:${filterMeasurementKey}`}
              source="modern"
              virtualItem={virtualItem}
              virtualizer={virtualizer}
            >
              <SessionConversationTimelineTrace {...traceProps} />
            </SessionVirtualizedRow>
          );
        })}
      </div>
    </div>
  );
}
