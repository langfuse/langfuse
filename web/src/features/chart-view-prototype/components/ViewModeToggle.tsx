import React from "react";
import { BarChart3, Table } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";

export type ViewMode = "table" | "chart";

/**
 * The toolbar affordance that flips the view between table and chart. The whole
 * prototype hangs off this one control — "any view is a chart". View-only.
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
      className="gap-0"
    >
      <ToggleGroupItem
        value="table"
        aria-label="Table view"
        className="h-7 gap-1.5 rounded-r-none px-2.5 text-xs"
      >
        <Table className="h-3.5 w-3.5" />
        Table
      </ToggleGroupItem>
      <ToggleGroupItem
        value="chart"
        aria-label="Chart view"
        className="h-7 gap-1.5 rounded-l-none border-l-0 px-2.5 text-xs"
      >
        <BarChart3 className="h-3.5 w-3.5" />
        Chart
      </ToggleGroupItem>
    </ToggleGroup>
  );
});
