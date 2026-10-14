/* eslint-disable @repo/no-style-props */
import { Filter } from "lucide-react";

import { useDataTableControls } from "@/src/app/tables/common-components/data-table-controls";
import { Badge } from "@/src/app/design-system/legacy-primitives/badge";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { cn } from "@/src/app/utils/tailwind";
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
      <Filter className="icon-base text-icon-foreground" />
      <span>Filters</span>
      {activeFacetCount > 0 && (
        <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
          {activeFacetCount}
        </Badge>
      )}
    </Button>
  );
}
