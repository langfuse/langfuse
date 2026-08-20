import preview from "../../../../.storybook/preview";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";
import { ChevronDown, RefreshCw } from "lucide-react";

import { MobileFiltersSheet } from "@/src/features/events/components/MobileFiltersSheet";
import { ControlsContext } from "@/src/components/table/data-table-controls";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";

// =============================================================================
// WHY THIS STORY FAKES THE CONTROL NODES
// =============================================================================
// `MobileFiltersSheet` is a pure LAYOUT surface: EventsTable builds the real
// controllers (grammar search bar, time-range picker, preset chips, saved-views
// drawer, facet sidebar) and passes them in as nodes. Those controllers depend
// on tRPC, routing and several providers, so the story substitutes structural
// placeholders that stand in for each section. This exercises the sheet's own
// concerns — the header controls cluster, the pinned search, labeled sections,
// sticky footer, active-count badge, and the single-scroll body (presets, saved
// views and facets flowing together) — without dragging the whole page in.
//
// Open state is read from `ControlsContext` (the DataTableControls provider).
// The demo wrapper supplies that context with `open: true` so the sheet renders
// open; the trigger button and the footer's close still toggle it live.

const fakeSearch = <Input placeholder="Search traces…" className="h-9" />;

// Compact time-range + refresh cluster, as EventsTable builds it for the header
// row (label-only time range, refresh split with a chevron).
const fakeHeaderControls = (
  <div className="flex min-w-0 items-center gap-1">
    <Button variant="outline" size="sm" className="h-8 min-w-0">
      <span className="truncate">Past 24 hours</span>
    </Button>
    <div className="flex items-center">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 rounded-r-none border-r-0"
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-auto rounded-l-none border-l-0 px-2"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  </div>
);

const fakePresets = (
  <div className="flex flex-wrap gap-2">
    {["Quality", "Slow", "Cost"].map((chip) => (
      <Badge key={chip} variant="outline" className="cursor-pointer">
        {chip}
      </Badge>
    ))}
  </div>
);

const fakeSavedViews = (
  <Button variant="outline" size="sm" className="h-8">
    My Views
  </Button>
);

// Stand-in for DataTableControls in layout="inline": its own "Filters" header +
// a facet list that flows at NATURAL height (no internal scroll), so it reads
// correctly inside the sheet's single body scroll.
const fakeFacets = (
  <div className="bg-background flex w-full flex-col border-t">
    <div className="flex h-10 shrink-0 items-center gap-1.5 border-b px-3">
      <span className="text-sm font-bold">Filters</span>
    </div>
    <div className="w-full">
      {[
        "Name",
        "Environment",
        "Level",
        "Tags",
        "Model",
        "User",
        "Session",
        "Latency",
        "Cost",
        "Metadata",
      ].map((facet) => (
        <div
          key={facet}
          className="text-muted-foreground border-b px-3 py-2 text-sm"
        >
          {facet}
        </div>
      ))}
    </div>
  </div>
);

function MobileFiltersSheetDemo(
  props: ComponentProps<typeof MobileFiltersSheet>,
) {
  const [open, setOpen] = useState(true);
  return (
    <ControlsContext.Provider
      value={{ open, setOpen, tableName: "storybook", isMobile: true }}
    >
      <MobileFiltersSheet {...props} />
    </ControlsContext.Provider>
  );
}

const meta = preview.meta({
  component: MobileFiltersSheetDemo,
  parameters: { layout: "fullscreen" },
  args: {
    activeCount: 0,
    resultCount: null,
    onClearAll: fn(),
    search: fakeSearch,
    headerControls: fakeHeaderControls,
    presets: fakePresets,
    savedViews: fakeSavedViews,
    facets: fakeFacets,
  },
});

export default meta;

// Open sheet, no active filters — trigger badge hidden, footer reads
// "Show results" (count unknown, as on the lazily-counted events table).
export const Default = meta.story({});

// Active filters set the trigger badge and a known result count in the footer.
export const WithActiveFilters = meta.story({
  args: {
    activeCount: 3,
    resultCount: 1284,
  },
});
