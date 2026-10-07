import { type ComponentProps } from "react";
import { SessionVirtualizedRow } from "@/src/features/sessions/SessionVirtualizedRow";
import { SessionConversationTimelineTrace } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import { type SessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";

export function SessionConversationTimeline({
  traces,
  filterMeasurementKey,
  controller,
}: {
  traces: readonly ComponentProps<typeof SessionConversationTimelineTrace>[];
  filterMeasurementKey: string;
  controller: SessionConversationTimelineController;
}) {
  const { feedRef, virtualItems, virtualizer } = controller;

  return (
    <div
      ref={feedRef}
      aria-label="Session conversation timeline"
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
