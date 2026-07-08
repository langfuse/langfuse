"use client";

import { type PropsWithChildren, Children } from "react";
import { useMediaQuery } from "react-responsive";
import { ResizableSplitLayout } from "@/src/components/ui/resizable-split-layout";
import { useDataTableControls } from "./data-table-controls";

// Mirrors the trace peek's collapsed-panel rail (TraceLayoutDesktop): instead
// of hiding, the sidebar collapses to a thin rail carrying a re-open button
// (rendered by DataTableControls). Dragging below the min snaps to the rail.
const FILTER_PANEL_COLLAPSED_PX = 40;
const FILTER_PANEL_MIN_PX = 160;

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

  const filterDefault = 15;
  const tableDefault = 85;

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
