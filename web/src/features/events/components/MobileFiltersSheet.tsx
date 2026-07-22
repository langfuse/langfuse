"use client";

import { type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/src/components/ui/sheet";
import { useDataTableControls } from "@/src/components/table/data-table-controls";
import { numberFormatter } from "@/src/utils/numbers";

interface MobileFiltersSheetProps {
  /** Count shown on the trigger badge — active facet columns (+ free-text
   *  search, which also lives in this sheet now). Derived by the caller from
   *  the same sidebar filter state the desktop rail counts. */
  activeCount: number;
  /** Total matching results for the "Show N results" footer button. Null when
   *  the count is unknown (the events table counts lazily), which renders a
   *  plain "Show results" label instead. */
  resultCount: number | null;
  /** Clears filter state + search. Results update live, so this does not close
   *  the sheet. */
  onClearAll: () => void;
  /** Grammar search bar row (search-bar mode only). */
  search?: ReactNode;
  /** Time-range picker (+ optional refresh). */
  timeRange?: ReactNode;
  /** Category preset chips. */
  presets?: ReactNode;
  /** Saved-views drawer trigger ("My Views"). */
  savedViews?: ReactNode;
  /** Facet sidebar (DataTableControls). Owns its own "Filters" header + count
   *  badge and internal scroll, so it gets a bounded flex region rather than a
   *  labeled section of its own. */
  facets?: ReactNode;
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
        {label}
      </h3>
      {children}
    </section>
  );
}

/**
 * Mobile-only bottom sheet that collapses the traces toolbar's scattered
 * filter controls into ONE surface: search · time range · quick presets ·
 * saved views · facets. It hosts the SAME controllers EventsTable already
 * builds for desktop (passed in as nodes) — a presentation reshuffle, not a
 * state migration.
 *
 * Open state is the shared DataTableControls context (`mobileOpen`), so the
 * facet list expands (its rail-vs-expanded toggle keys off the provider's
 * `data-expanded`) and its in-sheet "Hide filters" button closes the sheet.
 */
export function MobileFiltersSheet({
  activeCount,
  resultCount,
  onClearAll,
  search,
  timeRange,
  presets,
  savedViews,
  facets,
}: MobileFiltersSheetProps) {
  const { open, setOpen } = useDataTableControls();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 shrink-0 gap-2">
          <SlidersHorizontal className="h-4 w-4" />
          <span>Filters</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-xs">
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        // No description; tell Radix it is intentional so it doesn't warn.
        aria-describedby={undefined}
        // Hide the wrapper's default close X (our header provides one) and
        // drop the default padding/gap so header/body/footer own their spacing.
        className="flex max-h-[85svh] flex-col gap-0 p-0 [&>button]:hidden"
      >
        {/* Accessible name for the dialog; the visible heading is below. */}
        <SheetTitle className="sr-only">Filters</SheetTitle>
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <span className="text-foreground text-lg font-bold">Filters</span>
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close filters"
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </SheetClose>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {/* Short top controls. Capped + scrollable so a tall stack (wrapping
              preset chips on a short screen) never starves the facet list. */}
          {(search || timeRange || presets || savedViews) && (
            <div className="flex max-h-[45svh] shrink-0 flex-col gap-5 overflow-y-auto border-b px-4 py-4">
              <Section label="Search">{search}</Section>
              <Section label="Time range">{timeRange}</Section>
              <Section label="Quick presets">{presets}</Section>
              <Section label="My views">{savedViews}</Section>
            </div>
          )}
          {/* Facets fill the remaining height; DataTableControls scrolls its
              own list within this bounded region. */}
          {facets && (
            <div className="flex min-h-0 flex-1 flex-col">{facets}</div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t px-4 py-3">
          <Button variant="outline" className="flex-1" onClick={onClearAll}>
            Clear all
          </Button>
          <SheetClose asChild>
            <Button className="flex-1">
              {resultCount != null
                ? `Show ${numberFormatter(resultCount, 0)} results`
                : "Show results"}
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
