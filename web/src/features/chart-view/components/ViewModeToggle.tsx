import React from "react";
import { BarChart3, Table } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
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
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(v) => {
        if (v) onModeChange(v as ViewMode);
      }}
      variant="outline"
      // Match the h-8 height of the sibling toolbar controls (preset chips, My
      // Views, Columns). The view-mode switch is conceptually separate from the
      // filter presets to its left, so give it a margin bump off that cluster.
      className="ml-1 gap-0"
    >
      <ToggleGroupItem
        value="table"
        aria-label="Table view"
        className="h-8 gap-1.5 rounded-r-none px-2.5 text-xs"
      >
        <Table className="h-3.5 w-3.5" />
        Table
      </ToggleGroupItem>
      <ToggleGroupItem
        value="chart"
        aria-label="Chart view"
        className="h-8 gap-1.5 rounded-l-none border-l-0 px-2.5 text-xs"
      >
        <BarChart3 className="h-3.5 w-3.5" />
        Chart
      </ToggleGroupItem>
    </ToggleGroup>
  );
});
