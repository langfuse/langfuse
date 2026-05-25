import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useDataTableControls } from "@/src/components/table/data-table-controls";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { type FilterState } from "@langfuse/shared";

/** FilterToggleButton shows / hides the table's sidebar filter panel and exposes the active filter count. */
export function FilterToggleButton({
  filterState,
}: {
  filterState?: FilterState;
}) {
  const { open, setOpen } = useDataTableControls();
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setOpen(!open)}
      className="flex h-8 items-center gap-2 text-sm"
    >
      {open ? (
        <PanelLeftClose className="h-4 w-4" />
      ) : (
        <PanelLeftOpen className="h-4 w-4" />
      )}
      <span>{open ? "Hide" : "Show"} filters</span>
      {filterState && filterState.length > 0 && (
        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
          {filterState.length}
        </Badge>
      )}
    </Button>
  );
}
