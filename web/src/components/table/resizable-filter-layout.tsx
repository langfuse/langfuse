"use client";

import { type PropsWithChildren, Children } from "react";
import { useMediaQuery } from "react-responsive";
import { ResizableSplitLayout } from "@/src/components/ui/resizable-split-layout";
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
  const { open, setOpen, tableName } = useDataTableControls();
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });

  // Extract filter sidebar and table content from children
  const childrenArray = Children.toArray(children).filter(Boolean);

  // If there's only one child, it's the table content (no filter sidebar)
  const hasFilterSidebar = childrenArray.length > 1;
  const filterSidebar = hasFilterSidebar ? childrenArray[0] : null;
  const tableContent = hasFilterSidebar
    ? childrenArray.slice(1)
    : childrenArray;

  // On mobile, honor the open state so the hide/show toggle works the same as
  // on desktop — collapsed by default, expandable via the controls button.
  if (!isDesktop) {
    return (
      <div className="flex flex-1 overflow-hidden">
        {open ? filterSidebar : null}
        {tableContent}
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
