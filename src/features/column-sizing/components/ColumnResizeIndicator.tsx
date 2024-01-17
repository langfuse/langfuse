import React from "react";
import { cn } from "@/src/utils/tailwind";
import { type Header } from "@tanstack/react-table";

type ColumnResizeIndicatorProps = {
  header: Header<any, unknown>;
};

const ColumnResizeIndicator = ({ header }: ColumnResizeIndicatorProps) => {
  return (
    <div
      onDoubleClick={() => header.column.resetSize()}
      title="Resize this column"
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        header.getResizeHandler()(event);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      className={cn(
        "absolute right-0 top-0 h-full w-1 select-none",
        header.column.getIsResizing()
          ? "cursor-col-resize bg-blue-300"
          : "cursor-grab",
      )}
    ></div>
  );
};

export default ColumnResizeIndicator;
