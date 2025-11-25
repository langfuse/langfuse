import { Button } from "@/src/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

interface NavigationPanelToggleButtonProps {
  isPanelCollapsed: boolean;
  onTogglePanel: () => void;
  shouldPulseToggle?: boolean;
}

export function NavigationPanelToggleButton({
  isPanelCollapsed,
  onTogglePanel,
  shouldPulseToggle = false,
}: NavigationPanelToggleButtonProps) {
  const capture = usePostHogClientCapture();
  return (
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
      className={cn("h-7 w-7", shouldPulseToggle && "animate-pulse")}
    >
      {isPanelCollapsed ? (
        <PanelLeftOpen className="h-3.5 w-3.5" />
      ) : (
        <PanelLeftClose className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
