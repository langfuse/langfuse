import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import { useTraceAnalyticsDimensions } from "@/src/tracing/traces/hooks/useTraceAnalyticsDimensions";

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
        <PanelLeftOpen className="icon-base text-icon-foreground" />
      ) : (
        <PanelLeftClose className="icon-base text-icon-foreground" />
      )}
    </Button>
  );
}
