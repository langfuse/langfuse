import React from "react";
import { ChartNoAxesColumn } from "lucide-react";
import { Toggle } from "@/src/components/ui/toggle";

/**
 * Toolbar affordance that shows/hides the outlier strip above the events
 * table (LFE-14451). Sits next to the Table⇄Chart view-mode toggle; the strip
 * is hidden by default and the choice persists per project.
 */
export const OutlierStripToggle = React.memo(function OutlierStripToggle({
  pressed,
  onPressedChange,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <Toggle
      variant="outline"
      pressed={pressed}
      onPressedChange={onPressedChange}
      aria-label="Toggle outlier chart"
      title="Cost & latency outliers over time"
      className="ml-1 h-8 gap-1.5 px-2.5 text-xs"
    >
      <ChartNoAxesColumn className="h-3.5 w-3.5" />
      Outliers
    </Toggle>
  );
});
