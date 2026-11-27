import { type ComponentProps } from "react";
import { SessionConversationTimelineTrace } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import { type SessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import styles from "./SessionConversationTimeline.module.css";

export function SessionConversationTimeline({
  traces,
  controller,
}: {
  traces: readonly ComponentProps<typeof SessionConversationTimelineTrace>[];
  controller: SessionConversationTimelineController;
}) {
  const { feedRef, virtualItems, virtualizer } = controller;
  const isSingleTraceView =
    traces.length > 0 &&
    traces.every(({ variant }) => variant === "single-trace");
  const rows = isSingleTraceView
    ? traces.map((trace, index) => ({
        key: trace.itemId ?? trace.trace.id,
        index,
        start: 0,
      }))
    : virtualItems;

  return (
    <div
      ref={feedRef}
      aria-label="Session conversation timeline"
      className={`${styles.timeline} h-full min-h-0 overflow-y-auto [overflow-anchor:none]`}
    >
      <div
        className={isSingleTraceView ? "flex min-h-full flex-col" : undefined}
        style={
          isSingleTraceView
            ? undefined
            : {
                height: `${virtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }
        }
      >
        {rows.map((virtualItem) => {
          const traceProps = traces[virtualItem.index];
          if (!traceProps) return null;

          return (
            <div
              key={virtualItem.key}
              ref={isSingleTraceView ? undefined : virtualizer.measureElement}
              data-index={isSingleTraceView ? undefined : virtualItem.index}
              data-session-virtualizer-row={
                isSingleTraceView ? undefined : "modern"
              }
              className={isSingleTraceView ? "flex flex-1 flex-col" : undefined}
              style={
                isSingleTraceView
                  ? undefined
                  : {
                      position: "absolute",
                      top: virtualItem.start,
                      left: 0,
                      width: "100%",
                    }
              }
            >
              <div className={isSingleTraceView ? "flex-1" : undefined}>
                {(!traceProps.isCollapsed ||
                  traces.findIndex(
                    (item) => item.trace.id === traceProps.trace.id,
                  ) === virtualItem.index) && (
                  <SessionConversationTimelineTrace {...traceProps} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
