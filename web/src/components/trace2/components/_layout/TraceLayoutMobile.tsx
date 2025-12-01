/**
 * TraceLayoutMobile - Touch-friendly vertical layout for mobile devices
 *
 * Purpose:
 * - Provide mobile-optimized UI without resizable panels
 * - Vertical stack: navigation at top, detail below
 * - No drag handles (confusing on touch devices)
 *
 * Layout:
 * - Navigation is collapsible (accordion-style)
 * - Detail takes remaining space
 * - All content scrollable within sections
 */

import { useState, createContext, useContext, type ReactNode } from "react";
import { Button } from "@/src/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

// Context for sharing accordion state with compound components
interface TraceLayoutMobileContext {
  isNavigationExpanded: boolean;
  setIsNavigationExpanded: (expanded: boolean) => void;
}

const LayoutContext = createContext<TraceLayoutMobileContext | null>(null);

function useLayoutContext() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error(
      "TraceLayoutMobile compound components must be used within TraceLayoutMobile",
    );
  }
  return context;
}

// Export hook for use in TracePanelNavigationLayoutMobile
export function useMobileLayoutContext() {
  return useLayoutContext();
}

export function TraceLayoutMobile({ children }: { children: ReactNode }) {
  const [isNavigationExpanded, setIsNavigationExpanded] = useState(true);

  const contextValue: TraceLayoutMobileContext = {
    isNavigationExpanded,
    setIsNavigationExpanded,
  };

  return (
    <LayoutContext.Provider value={contextValue}>
      <div className="flex h-full w-full flex-col">{children}</div>
    </LayoutContext.Provider>
  );
}

// Compound component: Navigation section with accordion
TraceLayoutMobile.NavigationPanel = function Navigation({
  children,
}: {
  children: ReactNode;
}) {
  const { isNavigationExpanded, setIsNavigationExpanded } = useLayoutContext();

  return (
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
        <div className="max-h-96 overflow-y-auto">{children}</div>
      )}
    </div>
  );
};

// Compound component: Detail section
TraceLayoutMobile.DetailPanel = function Detail({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="flex-1 overflow-y-auto">{children}</div>;
};
