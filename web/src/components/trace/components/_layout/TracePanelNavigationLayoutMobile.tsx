/**
 * TracePanelNavigationLayoutMobile - Mobile-specific layout wrapper for navigation panel
 *
 * Responsibility:
 * - Wrap navigation content with mobile-optimized layout structure
 * - Position TracePanelNavigationHiddenNotice above content
 * - Provide scrollable container for navigation content
 * - Render graph view below tree/timeline when enabled (collapsible)
 *
 * Hooks:
 * - None (pure layout component)
 * - useViewPreferences() - for showGraph preference
 * - useTraceGraphData() - for isGraphViewAvailable
 *
 * Re-renders when:
 * - Children change (TracePanelNavigation content)
 * - showGraph or isGraphViewAvailable changes
 * - Does NOT re-render when selection changes (isolated to detail panel)
 */

import { type ReactNode, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { TracePanelNavigationHiddenNotice } from "./TracePanelNavigationHiddenNotice";

export function TracePanelNavigationLayoutMobile({
  children,
  secondaryContent,
}: {
  children: ReactNode;
  secondaryContent?: ReactNode;
}) {
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <TracePanelNavigationHiddenNotice />
      <div className="flex-1 overflow-hidden">{children}</div>
      {secondaryContent && (
        <div className="border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsGraphExpanded(!isGraphExpanded)}
            className="flex w-full items-center justify-between px-2 py-1"
          >
            <span className="text-xs font-medium">Graph View</span>
            {isGraphExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
          {isGraphExpanded && (
            <div className="h-64 overflow-hidden">{secondaryContent}</div>
          )}
        </div>
      )}
    </div>
  );
}
