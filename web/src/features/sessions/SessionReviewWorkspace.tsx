import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Group, Panel, Separator, useGroupRef } from "react-resizable-panels";
import { useStore } from "zustand";
import { TraceReviewPanel } from "@/src/features/traces/components/TraceReviewPanel";
import { useTraceReviewPanel } from "@/src/features/traces/contexts/TraceReviewPanelContext";
import { SessionReviewLeadingProvider } from "@/src/features/sessions/sessionReviewLeading";
import { useElementSize } from "@/src/hooks/useElementSize";
import { cn } from "@/src/utils/tailwind";

const DEFAULT_REVIEW_PANEL_WIDTH_PX = 380;

function reviewPanelPercent(available: number, preferredPx: number) {
  if (available <= 0) return 28;
  const percent = (preferredPx / available) * 100;
  // The pixel minSize on the panel keeps a narrow desktop usable. This floor
  // only stops a huge monitor from rounding the preferred width down to nothing.
  return Math.round(Math.min(45, Math.max(8, percent)));
}

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
  const leadingRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const groupRef = useGroupRef();
  const [leadingElement, setLeadingElement] = useState<HTMLElement | null>(
    null,
  );
  const vertical = (size?.width ?? 0) < 762;
  const sessionMinimum = vertical ? "220px" : "400px";
  const reviewMinimum = vertical ? "220px" : "320px";

  useLayoutEffect(() => {
    setLeadingElement(leadingRef.current);
  }, []);

  useLayoutEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const bounds = rootRef.current?.getBoundingClientRect();
      const headerHeight = vertical
        ? (leadingRef.current?.offsetHeight ?? 0)
        : 0;
      const available = vertical
        ? Math.max(0, (bounds?.height ?? 0) - headerHeight)
        : (bounds?.width ?? 0);
      const preferred = vertical ? 280 : DEFAULT_REVIEW_PANEL_WIDTH_PX;
      const review = open ? reviewPanelPercent(available, preferred) : 0;
      groupRef.current?.setLayout({
        session: 100 - review,
        review,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, vertical, groupRef, rootRef]);

  useLayoutEffect(() => {
    if (!active || !vertical) return;
    const frame = requestAnimationFrame(() => {
      const root = rootRef.current;
      const review = reviewRef.current;
      if (!root || !review) return;
      const offset =
        review.getBoundingClientRect().top - root.getBoundingClientRect().top;
      const headerHeight = leadingRef.current?.offsetHeight ?? 0;
      const visibleHeight = Math.max(0, root.clientHeight - headerHeight);
      root.scrollTop +=
        offset -
        headerHeight -
        Math.max(0, visibleHeight - review.clientHeight);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, vertical, rootRef]);

  return (
    <SessionReviewLeadingProvider element={leadingElement}>
      <div
        ref={rootRef}
        className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto"
        data-trace-review-open={open || undefined}
        data-review-orientation={vertical ? "vertical" : "horizontal"}
      >
        <div
          ref={leadingRef}
          className="bg-background sticky top-0 z-30 w-full shrink-0 empty:hidden"
        />
        <Group
          groupRef={groupRef}
          orientation={vertical ? "vertical" : "horizontal"}
          className={cn(
            "min-h-0 w-full min-w-0 flex-1",
            open && (vertical ? "min-h-[441px]" : "min-h-[320px]"),
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
    </SessionReviewLeadingProvider>
  );
}
