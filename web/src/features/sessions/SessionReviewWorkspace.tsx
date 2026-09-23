import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Group, Panel, Separator, useGroupRef } from "react-resizable-panels";
import { useStore } from "zustand";
import { TraceReviewPanel } from "@/src/features/traces/components/TraceReviewPanel";
import { useTraceReviewPanel } from "@/src/features/traces/contexts/TraceReviewPanelContext";
import { useElementSize } from "@/src/hooks/useElementSize";
import { cn } from "@/src/utils/tailwind";

export function SessionReviewWorkspace({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const store = useTraceReviewPanel();
  const active = useStore(store, (state) => state.active);
  const open = active !== null;
  const [rootRef, size] = useElementSize<HTMLDivElement>();
  const reviewRef = useRef<HTMLDivElement>(null);
  const groupRef = useGroupRef();
  const vertical = (size?.width ?? 0) < 762;
  const sessionMinimum = vertical ? "360px" : "400px";
  const reviewMinimum = vertical ? "320px" : "360px";

  useLayoutEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      groupRef.current?.setLayout({
        session: open ? 60 : 100,
        review: open ? 40 : 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, vertical, groupRef]);

  useLayoutEffect(() => {
    if (!active || !vertical) return;
    const frame = requestAnimationFrame(() => {
      const root = rootRef.current;
      const review = reviewRef.current;
      if (!root || !review) return;
      const offset =
        review.getBoundingClientRect().top - root.getBoundingClientRect().top;
      root.scrollTop +=
        offset - Math.max(0, root.clientHeight - review.clientHeight);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, vertical, rootRef]);

  return (
    <div
      ref={rootRef}
      className="h-full min-h-0 min-w-0 overflow-y-auto"
      data-trace-review-open={open || undefined}
      data-review-orientation={vertical ? "vertical" : "horizontal"}
    >
      <Group
        groupRef={groupRef}
        orientation={vertical ? "vertical" : "horizontal"}
        className={cn(
          "h-full min-h-0 min-w-0",
          open && (vertical ? "min-h-[681px]" : "min-h-[320px]"),
        )}
      >
        <Panel
          id="session"
          defaultSize="100%"
          minSize={open ? sessionMinimum : "0%"}
        >
          <div className="@container/session-workspace h-full min-h-0 min-w-0">
            {children}
          </div>
        </Panel>
        <Separator
          disabled={!open}
          aria-label="Resize review panel"
          className={cn(
            "bg-border",
            vertical ? "h-px" : "w-px",
            !open && "hidden",
          )}
        />
        <Panel
          id="review"
          defaultSize="0%"
          minSize={open ? reviewMinimum : "0%"}
          maxSize={open ? "75%" : "0%"}
        >
          <div ref={reviewRef} className="h-full min-h-0" hidden={!open}>
            <TraceReviewPanel projectId={projectId} />
          </div>
        </Panel>
      </Group>
    </div>
  );
}
