"use client";

import {
  type PropsWithChildren,
  type ReactNode,
  Children,
  cloneElement,
  isValidElement,
} from "react";
import { X } from "lucide-react";
import { ResizableSplitLayout } from "@/src/components/ui/resizable-split-layout";
import { Sheet, SheetContent, SheetTitle } from "@/src/components/ui/sheet";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  SearchBarDraftCacheContext,
  useSearchBarDraftCache,
} from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { useDataTableControls } from "./data-table-controls";

// Mirrors the trace peek's collapsed-panel rail (TraceLayoutDesktop): instead
// of hiding, the sidebar collapses to a thin rail carrying a re-open button
// (rendered by DataTableControls). Dragging below the min snaps to the rail.
const FILTER_PANEL_COLLAPSED_PX = 40;
// The floor is where the layout genuinely stops working (the three-way
// operator tabs start clipping), not where it merely gets cozy — compact
// headers ellipse/wrap fine well below the comfortable default.
const FILTER_PANEL_MIN_PX = 160;
// Comfortable default width. The panel API takes percentages, so this is
// converted against the window width at mount — computing the percentage
// ourselves keeps the default deterministic, unlike a px defaultSize, which
// react-resizable-panels resolves against a transient first-measure width
// and eagerly persists (LFE-10601). Percentage-only defaults are wrong in
// the other direction: 15% was cramped on laptops and needlessly wide on
// ultrawides. Capped so the table keeps priority on narrow windows.
const FILTER_PANEL_DEFAULT_PX = 280;
const FILTER_PANEL_MAX_DEFAULT_PCT = 30;

/** Resizable layout for filter sidebar and table content.
 *  On mobile, renders a stacked layout instead of resizable panels.
 *  Expects exactly 2 children: filter sidebar (DataTableControls) and table content.
 */
export function ResizableFilterLayout({ children }: PropsWithChildren) {
  return <FilterPanels>{children}</FilterPanels>;
}

/**
 * Responsive composition for searchable filter tables.
 *
 * Desktop keeps the search bar and toolbar above the resizable sidebar/table
 * split. Mobile keeps the compact toolbar row visible, moves the large search
 * bar into the same Filters sheet as the facets, and leaves the table at full
 * width. The layout caches unsubmitted search text while the mobile sheet is
 * closed, without keeping the modal mounted while it is hidden.
 */
export function SearchableTableFilterLayout({
  search,
  toolbar,
  children,
}: PropsWithChildren<{
  search: ReactNode;
  toolbar: ReactNode;
}>) {
  const { isMobile } = useDataTableControls();
  const searchDraftCache = useSearchBarDraftCache(
    isValidElement(search) ? search.key : null,
  );

  return (
    <SearchBarDraftCacheContext.Provider value={searchDraftCache}>
      {isMobile ? null : search}
      {toolbar}
      <FilterPanels mobileSearch={isMobile ? search : null}>
        {children}
      </FilterPanels>
    </SearchBarDraftCacheContext.Provider>
  );
}

/** Sticky-header variant for tables whose search and toolbar must scroll as one band. */
export function StickySearchableTableFilterLayout({
  search,
  toolbar,
  nonStickyContent,
  children,
}: PropsWithChildren<{
  search: ReactNode;
  toolbar: ReactNode;
  nonStickyContent?: ReactNode;
}>) {
  const { isMobile } = useDataTableControls();
  const searchDraftCache = useSearchBarDraftCache(
    isValidElement(search) ? search.key : null,
  );

  return (
    <SearchBarDraftCacheContext.Provider value={searchDraftCache}>
      <div className="bg-background sticky top-0 z-30 pb-1.5">
        {isMobile ? null : search}
        {toolbar}
      </div>
      {nonStickyContent}
      <FilterPanels mobileSearch={isMobile ? search : null}>
        {children}
      </FilterPanels>
    </SearchBarDraftCacheContext.Provider>
  );
}

function FilterPanels({
  children,
  mobileSearch,
}: PropsWithChildren<{ mobileSearch?: ReactNode }>) {
  const { open, setOpen, tableName, isMobile } = useDataTableControls();
  const capture = usePostHogClientCapture();
  // Single-source the breakpoint from the controls provider (which derives
  // `open`/`setOpen` from the same value). Evaluating the media query
  // independently here let a desktop→mobile resize render the bottom sheet
  // while `open` still held the persisted DESKTOP open-state — briefly showing
  // an open desktop sidebar as a mobile sheet.
  const isDesktop = !isMobile;

  // Extract filter sidebar and table content from children
  const childrenArray = Children.toArray(children).filter(Boolean);

  // If there's only one child, it's the table content (no filter sidebar)
  const hasFilterSidebar = childrenArray.length > 1;
  const filterSidebar = hasFilterSidebar ? childrenArray[0] : null;
  const tableContent = hasFilterSidebar
    ? childrenArray.slice(1)
    : childrenArray;

  const emitMobileClose = (trigger: "header" | "mobile_sheet_dismiss") => {
    capture("filters:sidebar_toggled", {
      tableName,
      open: false,
      trigger,
    });
  };

  // Searchable tables use the same single-scroll presentation as the Events
  // Filters sheet. The first child is always DataTableControls; override only
  // its presentation while it is mounted in the sheet so the sheet owns the
  // title/close chrome and the facet list contributes natural height.
  const mobileFilterSidebar = isValidElement<{ layout?: "panel" | "inline" }>(
    filterSidebar,
  )
    ? cloneElement(filterSidebar, { layout: "inline" })
    : filterSidebar;

  // On mobile the desktop rail doesn't fit — the table takes the full width and
  // the filter panel opens in a bottom sheet (driven by the same open state the
  // "Filters" toggle in the toolbar controls), rather than squeezing the
  // desktop sidebar inline alongside the table.
  if (!isDesktop) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {tableContent}
        {filterSidebar && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent
              side="bottom"
              aria-describedby={undefined}
              // Emit the same close-analytics event the header X / rail / menu
              // fire, but ONLY for user-dismiss (backdrop + Escape) — these
              // Radix callbacks don't run for the programmatic close from the
              // header X, so this counts the previously-silent dismiss path
              // without double-counting the others.
              onInteractOutside={() => emitMobileClose("mobile_sheet_dismiss")}
              onEscapeKeyDown={() => emitMobileClose("mobile_sheet_dismiss")}
              // Hide the Sheet's own close button — the filter panel header
              // renders its own close (X), so a second one just collides with
              // the panel's controls.
              className="flex h-[85svh] flex-col gap-0 p-0 [&>button]:hidden"
            >
              <SheetTitle className="sr-only">Filters</SheetTitle>
              {mobileSearch ? (
                <>
                  <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
                    <span className="text-foreground text-lg font-bold">
                      Filters
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Close filters"
                      className="ml-auto h-8 w-8 shrink-0"
                      onClick={() => {
                        setOpen(false);
                        emitMobileClose("header");
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="shrink-0 border-b px-2 py-2">
                    {mobileSearch}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    {mobileFilterSidebar}
                  </div>
                </>
              ) : (
                filterSidebar
              )}
            </SheetContent>
          </Sheet>
        )}
      </div>
    );
  }

  // Only reached on desktop (the mobile branch returned above), so `window`
  // exists; the guard covers SSR type narrowing.
  const filterDefault =
    typeof window === "undefined"
      ? FILTER_PANEL_MAX_DEFAULT_PCT / 2
      : Math.min(
          FILTER_PANEL_MAX_DEFAULT_PCT,
          (FILTER_PANEL_DEFAULT_PX / Math.max(window.innerWidth, 1)) * 100,
        );
  const tableDefault = 100 - filterDefault;

  // If sidebar doesn't exist, render only the table content
  if (!filterSidebar) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">{tableContent}</div>
    );
  }

  return (
    <ResizableSplitLayout
      primaryContent={
        <div className="flex h-full flex-col overflow-hidden">
          {tableContent}
        </div>
      }
      secondaryContent={filterSidebar}
      open={open}
      onOpenChange={setOpen}
      defaultPrimarySize={tableDefault}
      defaultSecondarySize={filterDefault}
      minPrimarySize={50}
      maxSecondarySize={50}
      collapsedSecondarySize={`${FILTER_PANEL_COLLAPSED_PX}px`}
      minSecondarySize={`${FILTER_PANEL_MIN_PX}px`}
      secondaryPosition="left"
      persistId={tableName ? `filter-layout-${tableName}` : "filter-layout"}
    />
  );
}
