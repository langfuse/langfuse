import { type ComponentProps } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown } from "lucide-react";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
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
    projectId: string;
    previousTrace?: Pick<EventSessionTrace, "id" | "timestamp">;
    nextTrace?: Pick<EventSessionTrace, "id" | "timestamp">;
  };
}) {
  const { feedRef, virtualItems, virtualizer } = controller;

  return (
    <div
      ref={feedRef}
      aria-label="Session conversation timeline"
      className={`${styles.timeline} h-full min-h-0 overflow-y-auto [overflow-anchor:none]`}
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
              {virtualItem.index === 0 && navigation?.previousTrace && (
                <div className="flex justify-center pb-4">
                  <Link
                    className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    href={{
                      pathname: `/project/${navigation.projectId}/traces/${navigation.previousTrace.id}`,
                      query: {
                        timestamp:
                          navigation.previousTrace.timestamp.toISOString(),
                        traceView: "messages",
                      },
                    }}
                  >
                    <ArrowUp className="icon-base" />
                    Previous trace in session
                  </Link>
                </div>
              )}
              <SessionConversationTimelineTrace {...traceProps} />
              {virtualItem.index === traces.length - 1 &&
                navigation?.nextTrace && (
                  <div className="flex justify-center pt-4">
                    <Link
                      className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                      href={{
                        pathname: `/project/${navigation.projectId}/traces/${navigation.nextTrace.id}`,
                        query: {
                          timestamp:
                            navigation.nextTrace.timestamp.toISOString(),
                          traceView: "messages",
                        },
                      }}
                    >
                      <ArrowDown className="icon-base" />
                      Next trace in session
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
