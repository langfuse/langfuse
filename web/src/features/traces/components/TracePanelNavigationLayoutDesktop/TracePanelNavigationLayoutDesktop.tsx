/**
 * TracePanelNavigationLayoutDesktop - Desktop-specific layout wrapper for navigation panel
 *
 * Responsibility:
 * - Wrap navigation content with header and collapsible layout structure
 * - Handle panel collapse/expand state for desktop
 * - Position the truncation + hidden-observation notices above content
 *
 * Hooks:
 * - useDesktopLayoutContext() - for panel collapse state
 */

import { type ReactNode } from "react";
import { useDesktopLayoutContext } from "../TraceLayoutDesktop";
import { TracePanelNavigationHeader } from "../TracePanelNavigationHeader/TracePanelNavigationHeader";
import { TracePanelNavigationHiddenNotice } from "./components/TracePanelNavigationHiddenNotice";
import { TraceTruncationNotice } from "../TraceTruncationNotice";

export function TracePanelNavigationLayoutDesktop({
  children,
}: {
  children: ReactNode;
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
          <TraceTruncationNotice />
          <TracePanelNavigationHiddenNotice />
          <div className="flex-1 overflow-hidden">{children}</div>
        </>
      )}
    </div>
  );
}
