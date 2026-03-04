/**
 * TracePanelNavigationLayoutDesktop - Desktop-specific layout wrapper for navigation panel
 *
 * Responsibility:
 * - Wrap navigation content with header and collapsible layout structure
 * - Handle panel collapse/expand state for desktop
 * - Position TracePanelNavigationHiddenNotice above content
 * - Render graph view panel below tree/timeline when enabled
 *
 * Hooks:
 * - useDesktopLayoutContext() - for panel collapse state
 * - useViewPreferences() - for showGraph preference
 * - useGraphData() - for isGraphViewAvailable
 *
 * Re-renders when:
 * - Panel collapse/expand state changes
 * - showGraph or isGraphViewAvailable changes
 * - Does NOT re-render when search/selection changes (isolated)
 */

import { type ReactNode } from "react";
import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from "@/src/components/ui/resizable";
import { useDesktopLayoutContext } from "./TraceLayoutDesktop";
import { TracePanelNavigationHeader } from "./TracePanelNavigationHeader";
import { TracePanelNavigationHiddenNotice } from "./TracePanelNavigationHiddenNotice";

export function TracePanelNavigationLayoutDesktop({
  children,
  secondaryContent,
}: {
  children: ReactNode;
  secondaryContent?: ReactNode;
}) {
  const { isNavigationPanelCollapsed, handleTogglePanel, shouldPulseToggle } =
    useDesktopLayoutContext();

  return (
    <div className="flex h-full flex-col border-r">
      <TracePanelNavigationHeader
        isPanelCollapsed={isNavigationPanelCollapsed}
        onTogglePanel={handleTogglePanel}
        shouldPulseToggle={shouldPulseToggle}
      />
      {!isNavigationPanelCollapsed && (
        <>
          <TracePanelNavigationHiddenNotice />
          {secondaryContent ? (
            <ResizablePanelGroup
              orientation="vertical"
              className="flex-1 overflow-hidden"
            >
              <ResizablePanel defaultSize="60%" minSize="20%">
                <div className="h-full overflow-hidden">{children}</div>
              </ResizablePanel>
              <ResizableHandle className="h-px bg-border" />
              <ResizablePanel defaultSize="40%" minSize="20%">
                <div className="h-full overflow-hidden">{secondaryContent}</div>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <div className="flex-1 overflow-hidden">{children}</div>
          )}
        </>
      )}
    </div>
  );
}
