/**
 * TracePanelNavigationWrapper - Layout wrapper for navigation panel
 *
 * Responsibility:
 * - Wrap navigation content with header and collapsible layout structure
 * - Handle panel collapse/expand state for desktop
 * - Position HiddenObservationsNotice above content
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
import { HiddenObservationsNotice } from "./HiddenObservationsNotice";

export function TracePanelNavigationWrapper({
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
          <HiddenObservationsNotice />
          <div className="flex-1 overflow-hidden">{children}</div>
        </>
      )}
    </div>
  );
}
