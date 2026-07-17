import { type ReactNode, useCallback, useId, useLayoutEffect } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  useDefaultLayout,
  usePanelRef,
} from "@/src/components/ui/resizable";

interface ResizableSplitLayoutProps {
  primaryContent: ReactNode;
  secondaryContent: ReactNode;
  open: boolean;
  showHandle?: boolean;
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
  showHandle = true,
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

  // In rail mode the collapsed panel stays visible (the caller renders a rail
  // in it) and keeps its handle so it can be dragged back open.
  const secondaryPanelClassName = hasCollapsedRail
    ? undefined
    : open
      ? "visible"
      : "invisible";
  const showSecondaryHandle = showHandle && (open || hasCollapsedRail);

  return (
    <ResizablePanelGroup
      id={groupId}
      orientation="horizontal"
      className={className}
      defaultLayout={renderSecondaryPanel ? defaultLayout : undefined}
      onLayoutChanged={
        persistId && renderSecondaryPanel ? onLayoutChanged : undefined
      }
    >
      {secondaryPosition === "left" && renderSecondaryPanel && (
        <ResizablePanel
          key={SECONDARY_PANEL_ID}
          id={SECONDARY_PANEL_ID}
          panelRef={secondaryPanelRef}
          defaultSize={`${defaultSecondarySize}%`}
          minSize={minSecondarySize}
          maxSize={`${maxSecondarySize}%`}
          collapsible={true}
          collapsedSize={collapsedSecondarySize}
          onResize={handleSecondaryResize}
          className={secondaryPanelClassName}
          style={{ overscrollBehaviorY: "none" }}
        >
          {secondaryContent}
        </ResizablePanel>
      )}
      {secondaryPosition === "left" && showSecondaryHandle && (
        <ResizableHandle key="secondary-handle" withHandle />
      )}
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
      {secondaryPosition === "right" && showSecondaryHandle && (
        <ResizableHandle key="secondary-handle" withHandle />
      )}
      {secondaryPosition === "right" && renderSecondaryPanel && (
        <ResizablePanel
          key={SECONDARY_PANEL_ID}
          id={SECONDARY_PANEL_ID}
          panelRef={secondaryPanelRef}
          defaultSize={`${defaultSecondarySize}%`}
          minSize={minSecondarySize}
          maxSize={`${maxSecondarySize}%`}
          collapsible={true}
          collapsedSize={collapsedSecondarySize}
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
