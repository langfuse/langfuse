/**
 * MobileTraceLayout - Touch-friendly vertical layout for mobile devices
 *
 * Purpose:
 * - Provide mobile-optimized UI without resizable panels
 * - Vertical stack: navigation at top, preview below
 * - No drag handles (confusing on touch devices)
 *
 * Layout:
 * - Navigation is collapsible (accordion-style)
 * - Preview takes remaining space
 * - All content scrollable within sections
 */

import { TracePanelNavigation } from "./TracePanelNavigation";
import { TracePanelDetail } from "./TracePanelDetail";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

export function TraceLayoutMobile() {
  const [isNavigationExpanded, setIsNavigationExpanded] = useState(true);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Navigation Section - Collapsible */}
      <div className="flex flex-shrink-0 flex-col border-b">
        {/* Accordion Header */}
        <Button
          variant="ghost"
          className="flex w-full justify-between rounded-none px-4 py-3 text-left"
          onClick={() => setIsNavigationExpanded(!isNavigationExpanded)}
        >
          <span className="font-medium">Navigation</span>
          {isNavigationExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>

        {/* Navigation Content - Collapsible */}
        {isNavigationExpanded && (
          <div className="max-h-96 overflow-y-auto">
            <TracePanelNavigation
              onTogglePanel={() => setIsNavigationExpanded(false)}
              isPanelCollapsed={!isNavigationExpanded}
            />
          </div>
        )}
      </div>

      {/* Preview Section - Takes remaining space */}
      <div className="flex-1 overflow-y-auto">
        <TracePanelDetail />
      </div>
    </div>
  );
}
