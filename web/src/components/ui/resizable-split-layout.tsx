import { type ReactNode, useId, useLayoutEffect } from "react";
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
  className = "flex h-full w-full",
  secondaryPosition = "right",
  keepSecondaryMounted = true,
  persistId,
}: ResizableSplitLayoutProps) {
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
      // Fallback to default size if the panel remains effectively closed.
      if (panel.isCollapsed()) {
        panel.expand();
      }
      if (panel.getSize().asPercentage < 2) {
        panel.resize(`${defaultSecondarySize}%`);
      }
    } else {
      panel.collapse();
    }
  }, [keepSecondaryMounted, open, secondaryPanelRef, defaultSecondarySize]);

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
          minSize="0%"
          maxSize={`${maxSecondarySize}%`}
          collapsible={true}
          collapsedSize="0%"
          className={open ? "visible" : "invisible"}
          style={{ overscrollBehaviorY: "none" }}
        >
          {secondaryContent}
        </ResizablePanel>
      )}
      {secondaryPosition === "left" && open && showHandle && (
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
      {secondaryPosition === "right" && open && showHandle && (
        <ResizableHandle key="secondary-handle" withHandle />
      )}
      {secondaryPosition === "right" && renderSecondaryPanel && (
        <ResizablePanel
          key={SECONDARY_PANEL_ID}
          id={SECONDARY_PANEL_ID}
          panelRef={secondaryPanelRef}
          defaultSize={`${defaultSecondarySize}%`}
          minSize="0%"
          maxSize={`${maxSecondarySize}%`}
          collapsible={true}
          collapsedSize="0%"
          className={open ? "visible" : "invisible"}
          style={{ overscrollBehaviorY: "none" }}
        >
          {secondaryContent}
        </ResizablePanel>
      )}
    </ResizablePanelGroup>
  );
}
