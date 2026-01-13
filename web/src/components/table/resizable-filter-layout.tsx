"use client";

import { type PropsWithChildren, Children } from "react";
import { useMediaQuery } from "react-responsive";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { useDataTableControls } from "./data-table-controls";

/** Resizable layout for filter sidebar and table content.
 *  On mobile, renders a stacked layout instead of resizable panels.
 *  Expects exactly 2 children: filter sidebar (DataTableControls) and table content.
 */
export function ResizableFilterLayout({ children }: PropsWithChildren) {
  const { open, tableName } = useDataTableControls();
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });

  // On mobile, render children as-is (stacked layout)
  if (!isDesktop) {
    return <div className="flex flex-1 overflow-hidden">{children}</div>;
  }

  // Extract filter sidebar and table content from children
  const childrenArray = Children.toArray(children).filter(Boolean);

  // If there's only one child, it's the table content (no filter sidebar)
  const hasFilterSidebar = childrenArray.length > 1;
  const filterSidebar = hasFilterSidebar ? childrenArray[0] : null;
  const tableContent = hasFilterSidebar
    ? childrenArray.slice(1)
    : childrenArray;

  const filterDefault = 15;
  const tableDefault = 85;

  // If sidebar is collapsed or doesn't exist, render only the table content
  if (!open || !filterSidebar) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">{tableContent}</div>
    );
  }

  const autoSaveId = tableName ? `filter-layout-${tableName}` : "filter-layout";

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="flex h-full w-full"
      autoSaveId={autoSaveId}
      storage={sessionStorage}
    >
      <ResizablePanel defaultSize={filterDefault} minSize={12} maxSize={50}>
        {filterSidebar}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize={tableDefault} minSize={50}>
        <div className="flex h-full flex-col overflow-hidden">
          {tableContent}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
