import React from "react";
import { BarChart3, Table } from "lucide-react";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { type ViewMode } from "../types";

/**
 * The toolbar affordance that flips the v4 events view between table and chart.
 * "Any view is a chart". View-only.
 */
export const ViewModeToggle = React.memo(function ViewModeToggle({
  mode,
  onModeChange,
}: {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
}) {
  return (
    // Offset from the filter-preset cluster to its left.
    <div className="ml-1">
      <Tabs value={mode} onValueChange={(v) => onModeChange(v as ViewMode)}>
        <Tabs.List variant="inset" size="md" aria-label="View mode">
          <Tabs.Trigger value="table" icon={Table} label="Table" />
          <Tabs.Trigger value="chart" icon={BarChart3} label="Chart" />
        </Tabs.List>
      </Tabs>
    </div>
  );
});
