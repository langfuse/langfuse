import { type ComponentProps } from "react";
import { SessionConversationTimelineTrace } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import { type SessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";

export function SessionConversationTimeline({
  traces,
  controller,
}: {
  traces: readonly ComponentProps<typeof SessionConversationTimelineTrace>[];
  controller: SessionConversationTimelineController;
}) {
  const { feedRef, virtualItems, virtualizer } = controller;

  return (
    <div
      ref={feedRef}
      aria-label="Session conversation timeline"
      className="h-full min-h-0 overflow-y-auto [overflow-anchor:none]"
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
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              data-session-virtualizer-row="modern"
              style={{
                position: "absolute",
                top: virtualItem.start,
                left: 0,
                width: "100%",
              }}
            >
              <SessionConversationTimelineTrace {...traceProps} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
