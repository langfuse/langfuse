import { type ComponentProps } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown } from "lucide-react";
import { SessionConversationTimelineTrace } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import { type SessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import styles from "./SessionConversationTimeline.module.css";

export function SessionConversationTimeline({
  traces,
  controller,
  navigation,
}: {
  traces: readonly ComponentProps<typeof SessionConversationTimelineTrace>[];
  controller: SessionConversationTimelineController;
  navigation?: {
    previousTrace?: Pick<ComponentProps<typeof Link>, "href" | "shallow"> & {
      count: number;
    };
    nextTrace?: Pick<ComponentProps<typeof Link>, "href" | "shallow"> & {
      count: number;
    };
  };
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
              {virtualItem.index === 0 && navigation?.previousTrace && (
                <div className="flex justify-center pb-4">
                  <Link
                    href={navigation.previousTrace.href}
                    shallow={navigation.previousTrace.shallow}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <ArrowUp className="icon-base" />
                    Previous trace in session ({navigation.previousTrace.count})
                  </Link>
                </div>
              )}
              <div className={isSingleTraceView ? "flex-1" : undefined}>
                <SessionConversationTimelineTrace {...traceProps} />
              </div>
              {virtualItem.index === traces.length - 1 &&
                navigation?.nextTrace && (
                  <div className="flex justify-center pt-4">
                    <Link
                      href={navigation.nextTrace.href}
                      shallow={navigation.nextTrace.shallow}
                      className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <ArrowDown className="icon-base" />
                      Next trace in session ({navigation.nextTrace.count})
                    </Link>
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
