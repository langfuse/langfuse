/* eslint-disable @repo/no-style-props */
import { type ReactNode, useCallback, useId, useLayoutEffect } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
  usePanelRef,
} from "@/src/components/ui/resizable";
import { cn } from "@/src/utils/tailwind";

interface ResizableSplitLayoutProps {
  primaryContent: ReactNode;
  secondaryContent: ReactNode;
  open: boolean;
  defaultPrimarySize?: number;
  defaultSecondarySize?: number;
  minPrimarySize?: number;
  maxSecondarySize?: number;
  /** Collapse the secondary panel to this width instead of hiding it ("rail"
   *  mode, e.g. "40px"). The panel content stays mounted and visible, so the
   *  caller must render its own collapsed state (rail) when `open` is false.
   *  Also keeps the resize handle while collapsed and reports drag-driven
   *  collapse/expand via `onOpenChange`. */
  collapsedSecondarySize?: string;
  /** Floor for the secondary panel while open; dragging below it snaps to
   *  `collapsedSecondarySize` when rail mode is active. */
  minSecondarySize?: string;
  /** Called when a drag collapses or expands the secondary panel so the caller
   *  can keep its controlled `open` state in sync (rail mode only). */
  onOpenChange?: (open: boolean) => void;
  className?: string;
  secondaryPosition?: "left" | "right";
  keepSecondaryMounted?: boolean;
  persistId?: string;
}

const PRIMARY_PANEL_ID = "primary";
const SECONDARY_PANEL_ID = "secondary";

const NOOP_LAYOUT_STORAGE = {
  getItem: () => null,
  setItem: () => {},
};

/**
 * Horizontal split layout with a collapsible secondary panel.
 *
 * Keeps the primary panel mounted so callers can preserve state while opening
 * and closing the secondary panel. By default, the secondary panel also stays
 * mounted and collapses; callers can opt out to remove inactive secondary DOM.
 */
export function ResizableSplitLayout({
  primaryContent,
  secondaryContent,
  open,
  defaultPrimarySize = 70,
  defaultSecondarySize = 30,
  minPrimarySize = 30,
  maxSecondarySize = 60,
  collapsedSecondarySize = "0%",
  minSecondarySize = "0%",
  onOpenChange,
  className = "flex h-full w-full",
  secondaryPosition = "right",
  keepSecondaryMounted = true,
  persistId,
}: ResizableSplitLayoutProps) {
  const hasCollapsedRail = collapsedSecondarySize !== "0%";
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const groupId = persistId
    ? `resizable-layout-${persistId}`
    : `resizable-layout-${instanceId}`;

  const storage =
    persistId && typeof window !== "undefined"
      ? sessionStorage
      : NOOP_LAYOUT_STORAGE;

  const renderSecondaryPanel = keepSecondaryMounted || open;
  const panelIds = renderSecondaryPanel
    ? secondaryPosition === "left"
      ? [SECONDARY_PANEL_ID, PRIMARY_PANEL_ID]
      : [PRIMARY_PANEL_ID, SECONDARY_PANEL_ID]
    : [PRIMARY_PANEL_ID];

  const secondaryPanelRef = usePanelRef();

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: groupId,
    panelIds,
    storage,
  });

  const secondaryDefaultSize = `${defaultSecondarySize}%`;
  const secondaryMinSize = minSecondarySize;
  const secondaryMaxSize = `${maxSecondarySize}%`;

  // Without a rail, a persisted 0% share is an unrecoverable sliver. Restore
  // the default split instead of handing that layout to the group.
  const secondaryShare = defaultLayout?.[SECONDARY_PANEL_ID];
  const restoredLayout =
    !hasCollapsedRail &&
    typeof secondaryShare === "number" &&
    secondaryShare < 2
      ? {
          ...defaultLayout,
          [PRIMARY_PANEL_ID]: defaultPrimarySize,
          [SECONDARY_PANEL_ID]: defaultSecondarySize,
        }
      : defaultLayout;

  useLayoutEffect(() => {
    if (!keepSecondaryMounted) return;

    const panel = secondaryPanelRef.current;
    if (!panel) return;

    if (open) {
      // v4 react-resizable-panel `expand()` depends on internal collapsed bookkeeping.
      // Fallback to default size if the panel remains effectively closed: still
      // collapsed (a no-op expand in rail mode, where the collapsed rail is
      // wider than any fixed percentage threshold) or near-zero width (the
      // "0%"-collapse mode).
      if (panel.isCollapsed()) {
        panel.expand();
      }
      if (panel.isCollapsed() || panel.getSize().asPercentage < 2) {
        panel.resize(`${defaultSecondarySize}%`);
      }
    } else if (!panel.isCollapsed()) {
      panel.collapse();
    }
  }, [keepSecondaryMounted, open, secondaryPanelRef, defaultSecondarySize]);

  // Rail mode: a drag can snap the panel to its collapsed rail (or pull it back
  // open) without going through the caller's toggle, so report the panel's
  // collapsed state back whenever it disagrees with the controlled `open`.
  const handleSecondaryResizeCallback = useCallback(() => {
    const panel = secondaryPanelRef.current;
    if (!panel || !onOpenChange) return;
    const panelOpen = !panel.isCollapsed();
    if (panelOpen !== open) onOpenChange(panelOpen);
  }, [secondaryPanelRef, onOpenChange, open]);
  const handleSecondaryResize =
    hasCollapsedRail && onOpenChange
      ? handleSecondaryResizeCallback
      : undefined;

  // `relative` mirrors the primary panel's wrapper below: without a containing
  // block here, absolutely-positioned secondary content (Tailwind's `sr-only`
  // among it) resolves against the app shell, escapes this panel's scroll clip
  // and grows the document instead.
  // In rail mode the collapsed panel stays visible (the caller renders a rail
  // in it) and keeps its handle so it can be dragged back open.
  const secondaryPanelClassName = cn(
    // overflow-visible so a right-rail shadow can paint onto the primary pane.
    "relative overflow-visible",
    !hasCollapsedRail && (open ? "visible" : "invisible"),
  );
  const showSecondaryHandle = open || hasCollapsedRail;

  const resizeHandle = (
    <ResizableHandle
      key="secondary-handle"
      withHandle
      className={cn(
        // Peek-style: a wide hit target, a 1px seam at rest, and a full-height
        // bar on hover/drag. The inner `withHandle` pill is restyled to that bar.
        "group/resize bg-transparent after:w-3",
        "[&>div]:h-full [&>div]:w-1 [&>div]:rounded-full [&>div]:bg-transparent [&>div]:transition-colors",
        "hover:[&>div]:bg-muted-foreground/40",
        "active:[&>div]:bg-muted-foreground/60",
        "focus-visible:[&>div]:bg-muted-foreground/50",
      )}
    />
  );

  return (
    <ResizablePanelGroup
      id={groupId}
      orientation="horizontal"
      className={className}
      defaultLayout={renderSecondaryPanel ? restoredLayout : undefined}
      onLayoutChanged={
        persistId && renderSecondaryPanel ? onLayoutChanged : undefined
      }
    >
      {secondaryPosition === "left" && renderSecondaryPanel && (
        <ResizablePanel
          key={SECONDARY_PANEL_ID}
          id={SECONDARY_PANEL_ID}
          panelRef={secondaryPanelRef}
          defaultSize={secondaryDefaultSize}
          minSize={secondaryMinSize}
          maxSize={secondaryMaxSize}
          collapsible={hasCollapsedRail}
          collapsedSize={hasCollapsedRail ? collapsedSecondarySize : undefined}
          onResize={handleSecondaryResize}
          className={secondaryPanelClassName}
          style={{ overscrollBehaviorY: "none" }}
        >
          {secondaryContent}
        </ResizablePanel>
      )}
      {secondaryPosition === "left" && showSecondaryHandle && resizeHandle}
      <ResizablePanel
        key={PRIMARY_PANEL_ID}
        id={PRIMARY_PANEL_ID}
        defaultSize={renderSecondaryPanel ? `${defaultPrimarySize}%` : "100%"}
        minSize={`${minPrimarySize}%`}
      >
        <div
          className="relative h-full w-full overflow-auto"
          style={{ overscrollBehaviorY: "none" }}
        >
          {primaryContent}
        </div>
      </ResizablePanel>
      {secondaryPosition === "right" && showSecondaryHandle && resizeHandle}
      {secondaryPosition === "right" && renderSecondaryPanel && (
        <ResizablePanel
          key={SECONDARY_PANEL_ID}
          id={SECONDARY_PANEL_ID}
          panelRef={secondaryPanelRef}
          defaultSize={secondaryDefaultSize}
          minSize={secondaryMinSize}
          maxSize={secondaryMaxSize}
          collapsible={hasCollapsedRail}
          collapsedSize={hasCollapsedRail ? collapsedSecondarySize : undefined}
          onResize={handleSecondaryResize}
          className={secondaryPanelClassName}
          style={{ overscrollBehaviorY: "none" }}
        >
          {secondaryContent}
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  );
}
