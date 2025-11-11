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
  const { open } = useDataTableControls();
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });

  // On mobile, render children as-is (stacked layout)
  if (!isDesktop) {
    return <div className="flex flex-1 overflow-hidden">{children}</div>;
  }

  // Extract filter sidebar and table content from children
  const childrenArray = Children.toArray(children).filter(Boolean);
  const filterSidebar = childrenArray[0];
  const tableContent = childrenArray.slice(1);

  const filterDefault = 15;
  const tableDefault = 85;

  // If sidebar is collapsed or doesn't exist, render only the table content
  if (!open || !filterSidebar) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">{tableContent}</div>
    );
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="flex h-full w-full">
      <ResizablePanel defaultSize={filterDefault} minSize={15} maxSize={50}>
        <div className="h-full w-full">{filterSidebar}</div>
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
