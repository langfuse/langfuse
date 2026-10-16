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
                    href={navigation.previousTrace.href}
                    shallow={navigation.previousTrace.shallow}
                    className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-4 py-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <ArrowUp className="icon-base" />
                    Previous trace in session ({navigation.previousTrace.count})
                  </Link>
                </div>
              )}
              <SessionConversationTimelineTrace {...traceProps} />
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
