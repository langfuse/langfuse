/**
 * TracePanelNavigationLayoutMobile - Mobile-specific layout wrapper for navigation panel
 *
 * Responsibility:
 * - Wrap navigation content with mobile-optimized layout structure
 * - Position TracePanelNavigationHiddenNotice above content
 * - Provide scrollable container for navigation content
 *
 * Hooks:
 * - None (pure layout component)
 *
 * Re-renders when:
 * - Children change (TracePanelNavigation content)
 * - Does NOT re-render when selection changes (isolated to detail panel)
 */

import { type ReactNode } from "react";
import { TracePanelNavigationHiddenNotice } from "./TracePanelNavigationHiddenNotice";

export function TracePanelNavigationLayoutMobile({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col">
      <TracePanelNavigationHiddenNotice />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
