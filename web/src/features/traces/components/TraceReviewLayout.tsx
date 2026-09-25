import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Group, Panel, Separator, useGroupRef } from "react-resizable-panels";
import { cn } from "@/src/utils/tailwind";

const NAVIGATION_PREFERENCE_KEY = "trace-review-navigation-collapsed";

function readNavigationPreference(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const value = localStorage.getItem(NAVIGATION_PREFERENCE_KEY);
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  } catch {
    return null;
  }
}

/** Keeps the trace and review editors mounted across responsive layout changes. */
export function TraceReviewLayout({
  open,
  review,
  children,
}: {
  open: boolean;
  review: ReactNode;
  children: (navigation: {
    collapsed: boolean;
    toggle: () => void;
  }) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const groupRef = useGroupRef();
  const [size, setSize] = useState({
    width: 0,
    availableWidth: 0,
    isPeek: false,
  });
  const [navigationPreference, setNavigationPreference] = useState(
    readNavigationPreference,
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sidebar = document.querySelector('[data-sidebar="sidebar"]');
    const measure = () => {
      const width = root.getBoundingClientRect().width;
      const sidebarRect = sidebar?.getBoundingClientRect();
      const sidebarWidth =
        sidebarRect && sidebarRect.left < 100 ? sidebarRect.right : 0;
      const isPeek = Boolean(root.closest("[data-peek-content]"));
      const availableWidth = isPeek ? window.innerWidth - sidebarWidth : width;
      setSize((previous) =>
        previous.width === width &&
        previous.availableWidth === availableWidth &&
        previous.isPeek === isPeek
          ? previous
          : { width, availableWidth, isPeek },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (sidebar) observer.observe(sidebar);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const collapsed = navigationPreference ?? size.availableWidth < 1120;
  // Account for the shell's CSS expansion in the first open render, before
  // ResizeObserver reports that width, so the pane doesn't switch axes on entry.
  const reviewWidth =
    open && size.isPeek
      ? Math.min(
          size.availableWidth,
          Math.max(size.width, collapsed ? 800 : 1120),
        )
      : size.width;
  const vertical = reviewWidth < (collapsed ? 762 : 983);
  const openLayout = collapsed ? "review" : "review-navigation";
  const horizontalWorkspaceMinimum = collapsed ? "400px" : "621px";
  const workspaceMinimum = vertical ? "240px" : horizontalWorkspaceMinimum;
  const reviewMinimum = vertical ? "320px" : "360px";

  useLayoutEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      groupRef.current?.setLayout({
        workspace: open ? 60 : 100,
        review: open ? 40 : 0,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, vertical, groupRef]);

  const toggle = () => {
    const next = !collapsed;
    setNavigationPreference(next);
    try {
      localStorage.setItem(NAVIGATION_PREFERENCE_KEY, String(next));
    } catch {
      // The preference remains available for this mounted workspace.
    }
  };

  return (
    <div
      ref={rootRef}
      className="h-full min-h-0 min-w-0 overflow-y-auto"
      data-peek-layout={open ? openLayout : undefined}
      data-review-orientation={vertical ? "vertical" : "horizontal"}
    >
      <Group
        groupRef={groupRef}
        orientation={vertical ? "vertical" : "horizontal"}
        className={cn(
          "h-full min-h-0 min-w-0",
          open && (vertical ? "min-h-[561px]" : "min-h-[320px]"),
        )}
      >
        <Panel
          id="workspace"
          defaultSize="100%"
          minSize={open ? workspaceMinimum : "0%"}
        >
          {children({ collapsed, toggle })}
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
          <div className="h-full min-h-0" hidden={!open}>
            {review}
          </div>
        </Panel>
      </Group>
    </div>
  );
}
