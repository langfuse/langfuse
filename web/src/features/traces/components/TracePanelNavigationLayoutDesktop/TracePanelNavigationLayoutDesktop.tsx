/**
 * TracePanelNavigationLayoutDesktop - Desktop-specific layout wrapper for navigation panel
 *
 * Responsibility:
 * - Wrap navigation content with header and collapsible layout structure
 * - Handle panel collapse/expand state for desktop
 * - Position the truncation + hidden-observation notices above content
 *
 * The graph used to render here as a resizable secondary panel below the
 * tree/timeline; it is a full view on the Tree/Timeline/Graph switch now, so
 * this wrapper is just header + notices + content.
 *
 * Hooks:
 * - useDesktopLayoutContext() - for panel collapse state
 */

import { type ReactNode } from "react";
import { useDesktopLayoutContext } from "../TraceLayoutDesktop";
import { TracePanelNavigationHeader } from "../TracePanelNavigationHeader/TracePanelNavigationHeader";
import { TracePanelNavigationHiddenNotice } from "./components/TracePanelNavigationHiddenNotice";
import { TraceTruncationNotice } from "@/src/features/traces/components/TraceTruncationNotice";

export function TracePanelNavigationLayoutDesktop({
  children,
}: {
  children: ReactNode;
}) {
  const { isNavigationPanelCollapsed, handleTogglePanel } =
    useDesktopLayoutContext();

  return (
    <div className="flex h-full flex-col border-r">
      <TracePanelNavigationHeader
        isPanelCollapsed={isNavigationPanelCollapsed}
        onTogglePanel={handleTogglePanel}
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
