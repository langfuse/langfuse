import { Button } from "@/src/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

interface TracePanelNavigationButtonProps {
  isPanelCollapsed: boolean;
  onTogglePanel: () => void;
  shouldPulseToggle?: boolean;
}

export function TracePanelNavigationButton({
  isPanelCollapsed,
  onTogglePanel,
  shouldPulseToggle = false,
}: TracePanelNavigationButtonProps) {
  const capture = usePostHogClientCapture();
  return (
    <div className="relative">
      <Button
        onClick={() => {
          onTogglePanel();
          capture("trace_detail:tree_panel_toggle", {
            collapsed: !isPanelCollapsed,
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

      {/* Pulsing status indicator */}
      {shouldPulseToggle && (
        <span className="pointer-events-none absolute right-0.5 top-0.5 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
        </span>
      )}
    </div>
  );
}
