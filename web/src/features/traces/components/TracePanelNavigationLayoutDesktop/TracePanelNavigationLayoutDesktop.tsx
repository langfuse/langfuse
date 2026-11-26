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
import { TraceTruncationNotice } from "@/src/features/traces/components/TraceTruncationNotice";
import { useTracePresentation } from "@/src/features/traces/contexts/TracePresentationProvider";
import { cn } from "@/src/utils/tailwind";

export function TracePanelNavigationLayoutDesktop({
  children,
  isLoading = false,
}: {
  children: ReactNode;
  isLoading?: boolean;
}) {
  const { isNavigationPanelCollapsed, handleTogglePanel } =
    useDesktopLayoutContext();
  const { isEmbedded } = useTracePresentation();
  // Embeds show the bare tree; the collapsed rail keeps its expand button.
  const showHeader = !isEmbedded || isNavigationPanelCollapsed;

  return (
    <div className="flex h-full flex-col">
      {showHeader ? (
        <TracePanelNavigationHeader
          isPanelCollapsed={isNavigationPanelCollapsed}
          onTogglePanel={handleTogglePanel}
          isLoading={isLoading}
        />
      ) : null}
      <div
        className={cn(
          "min-h-0 flex-1 flex-col",
          isNavigationPanelCollapsed ? "hidden" : "flex",
        )}
        inert={isNavigationPanelCollapsed}
      >
        {!isLoading && (
          <>
            <TraceTruncationNotice />
            <TracePanelNavigationHiddenNotice />
          </>
        )}
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
