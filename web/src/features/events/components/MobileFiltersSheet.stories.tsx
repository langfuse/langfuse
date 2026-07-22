import preview from "../../../../.storybook/preview";
import { useState, type ComponentProps } from "react";
import { fn } from "storybook/test";

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
// concerns — labeled sections, sticky footer, active-count badge, the bounded
// facet region — without dragging the whole page into Storybook.
//
// Open state is read from `ControlsContext` (the DataTableControls provider).
// The demo wrapper supplies that context with `open: true` so the sheet renders
// open; the trigger button and the footer's close still toggle it live.

const fakeSearch = <Input placeholder="Search traces…" className="h-9" />;

const fakeTimeRange = (
  <Button variant="outline" size="sm" className="h-8">
    Past 24 hours
  </Button>
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

// Stand-in for DataTableControls: its own "Filters" header + a scrollable facet
// list, so the bounded flex region reads correctly in the sheet.
const fakeFacets = (
  <div className="bg-background flex min-h-0 flex-1 flex-col border-t">
    <div className="flex h-10 shrink-0 items-center gap-1.5 border-b px-3">
      <span className="text-sm font-bold">Filters</span>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto">
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
    <ControlsContext.Provider value={{ open, setOpen, tableName: "storybook" }}>
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
    timeRange: fakeTimeRange,
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
