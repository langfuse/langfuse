import { Button } from "@/src/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useTraceAnalyticsDimensions } from "@/src/features/traces/hooks/useTraceAnalyticsDimensions";

interface TracePanelNavigationButtonProps {
  isPanelCollapsed: boolean;
  onTogglePanel: () => void;
}

export function TracePanelNavigationButton({
  isPanelCollapsed,
  onTogglePanel,
}: TracePanelNavigationButtonProps) {
  const capture = usePostHogClientCapture();
  const analyticsDimensions = useTraceAnalyticsDimensions();
  return (
    <div className="relative">
      <Button
        onClick={() => {
          onTogglePanel();
          capture("trace_detail:tree_panel_toggle", {
            collapsed: !isPanelCollapsed,
            ...analyticsDimensions,
          });
        }}
        variant="ghost"
        size="icon"
        title={isPanelCollapsed ? "Expand panel" : "Collapse panel"}
        className="h-7 w-7 shrink-0"
      >
        {isPanelCollapsed ? (
          <PanelLeftOpen className="h-3.5 w-3.5" />
        ) : (
          <PanelLeftClose className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  );
}
