/**
 * TracePanelNavigationLayoutDesktop - Desktop-specific layout wrapper for navigation panel
 *
 * Responsibility:
 * - Wrap navigation content with header and collapsible layout structure
 * - Handle panel collapse/expand state for desktop
 * - Position TracePanelNavigationHiddenNotice above content
 *
 * Hooks:
 * - useDesktopLayoutContext() - for panel collapse state
 *
 * Re-renders when:
 * - Panel collapse/expand state changes
 * - Does NOT re-render when search/selection changes (isolated)
 */

import { type ReactNode } from "react";
import { useDesktopLayoutContext } from "./TraceLayoutDesktop";
import { TracePanelNavigationHeader } from "./TracePanelNavigationHeader";
import { TracePanelNavigationHiddenNotice } from "./TracePanelNavigationHiddenNotice";

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
          <TracePanelNavigationHiddenNotice />
          <div className="flex-1 overflow-hidden">{children}</div>
        </>
      )}
    </div>
  );
}
