"use client";

import { type PropsWithChildren, Children } from "react";
import { useMediaQuery } from "react-responsive";
import { ResizableDesktopLayout } from "@/src/components/layouts/ResizableDesktopLayout";
import { useDataTableControls } from "./data-table-controls";

/** Resizable layout for filter sidebar and table content.
 *  On mobile, renders a stacked layout instead of resizable panels.
 *  Expects exactly 2 children: filter sidebar (DataTableControls) and table content.
 */
export function ResizableFilterLayout({ children }: PropsWithChildren) {
  const { open, tableName } = useDataTableControls();
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });

  // Extract filter sidebar and table content from children
  const childrenArray = Children.toArray(children).filter(Boolean);

  // If there's only one child, it's the table content (no filter sidebar)
  const hasFilterSidebar = childrenArray.length > 1;
  const filterSidebar = hasFilterSidebar ? childrenArray[0] : null;
  const tableContent = hasFilterSidebar
    ? childrenArray.slice(1)
    : childrenArray;

  // On mobile, render children as-is (stacked layout)
  if (!isDesktop) {
    return <div className="flex flex-1 overflow-hidden">{children}</div>;
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
    <ResizableDesktopLayout
      mainContent={
        <div className="flex h-full flex-col overflow-hidden">
          {tableContent}
        </div>
      }
      sidebarContent={filterSidebar}
      open={open}
      defaultMainSize={tableDefault}
      defaultSidebarSize={filterDefault}
      minMainSize={50}
      maxSidebarSize={50}
      sidebarPosition="left"
      persistId={tableName ? `filter-layout-${tableName}` : "filter-layout"}
    />
  );
}
