import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { useDataTableControls } from "@/src/components/table/data-table-controls";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { cn } from "@/src/utils/tailwind";
import { type FilterState } from "@langfuse/shared";

/** FilterToggleButton shows / hides the table's sidebar filter panel and exposes the active filter count.
 *  On desktop the sidebar carries its own collapse toggle and collapses to a
 *  rail with a re-open button (see DataTableControls), so this button is only
 *  rendered on mobile, where the stacked layout has no rail. */
export function FilterToggleButton({
  filterState,
  className,
}: {
  filterState?: FilterState;
  className?: string;
}) {
  const { open, setOpen } = useDataTableControls();
  // Count filtered COLUMNS (facets), not raw FilterState entries — one facet
  // can emit several entries (e.g. a numeric range writes >= and <=). Keeps
  // this badge consistent with the desktop rail's active-facet count.
  const activeFacetCount = filterState
    ? new Set(filterState.map((filter) => filter.column)).size
    : 0;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setOpen(!open)}
      className={cn("flex h-8 items-center gap-2 text-sm", className)}
    >
      {open ? (
        <PanelLeftClose className="h-4 w-4" />
      ) : (
        <PanelLeftOpen className="h-4 w-4" />
      )}
      <span>{open ? "Hide" : "Show"} filters</span>
      {activeFacetCount > 0 && (
        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
          {activeFacetCount}
        </Badge>
      )}
    </Button>
  );
}
