import { type CSSProperties } from "react";
import { type Column, type Table } from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type RowHeight } from "@/src/components/table/data-table-row-height-switch";
import { Skeleton } from "@/src/components/ui/skeleton";
import { TableCell, TableRow } from "@/src/components/ui/table";
import { cn } from "@/src/utils/tailwind";

export interface DataTableLoadingRowsProps<TData extends object> {
  table: Table<TData>;
  columns: LangfuseColumnDef<TData, any>[];
  rowheighttw?: string;
  rowHeight?: RowHeight;
}

// These are the important styles to make sticky column pinning work!
const getCommonPinningStyles = <TData,>(
  column: Column<TData>,
): CSSProperties => {
  const isPinned = column.getIsPinned();

  return {
    left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
    right: isPinned === "right" ? `${column.getAfter("right")}px` : undefined,
    position: isPinned ? "sticky" : "relative",
    width: column.getSize(),
    zIndex: isPinned ? 10 : 0,
    backgroundColor: isPinned ? "hsl(var(--background))" : undefined,
  };
};

// Get additional CSS classes for pinned columns
const getPinningClasses = <TData,>(column: Column<TData>): string => {
  const isPinned = column.getIsPinned();
  const isLastLeftPinnedColumn =
    isPinned === "left" && column.getIsLastColumn("left");
  const isFirstRightPinnedColumn =
    isPinned === "right" && column.getIsFirstColumn("right");

  return cn(
    isLastLeftPinnedColumn && "border-r border-border",
    isFirstRightPinnedColumn && "border-l border-border",
  );
};

export function DataTableSkeletonLoadingRows<TData extends object>({
  table,
  rowheighttw,
  rowHeight,
  rowCount = 10,
}: DataTableLoadingRowsProps<TData> & {
  rowCount?: number;
}) {
  const visibleColumns = table.getVisibleLeafColumns();
  const isSmallRowHeight = (rowHeight ?? "s") === "s";

  return (
    <>
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <TableRow key={`loading-row-${rowIndex}`}>
          {visibleColumns.map((column, colIndex) => (
            <TableCell
              key={`${column.id}-loading-${rowIndex}`}
              className={cn(
                "overflow-hidden border-b px-1 first:pl-2",
                isSmallRowHeight && "whitespace-nowrap",
                getPinningClasses(column),
              )}
              style={{
                width: `calc(var(--col-${column.id}-size) * 1px)`,
                ...getCommonPinningStyles(column),
              }}
            >
              <div
                className={cn(
                  "flex",
                  isSmallRowHeight ? "items-center" : "items-start",
                  !isSmallRowHeight && "py-1",
                  rowheighttw,
                )}
              >
                <Skeleton
                  className={cn(
                    "h-3",
                    (rowIndex + colIndex) % 2 === 0 ? "w-2/3" : "w-1/2",
                  )}
                />
              </div>
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
