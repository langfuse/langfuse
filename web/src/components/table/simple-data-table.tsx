import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Row,
} from "@tanstack/react-table";
import { Fragment, type ReactNode } from "react";

import { Skeleton } from "@/src/components/ui/skeleton";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { cn } from "@/src/utils/tailwind";

export function SimpleDataTable<TData extends object>({
  columns,
  data,
  isLoading,
  noResults,
  presentation = "default",
  bodyTone = "default",
  rowVariant = "default",
  selectedRowId,
  onRowClick,
  renderDetailRow,
}: {
  columns: LangfuseColumnDef<TData>[];
  data: TData[];
  isLoading: boolean;
  noResults: ReactNode;
  presentation?: "default" | "dense" | "wide";
  bodyTone?: "default" | "muted";
  rowVariant?:
    | "default"
    | "muted-hover"
    | "primary-hover"
    | "primary-hover-static"
    | "review";
  selectedRowId?: string | null;
  onRowClick?: (row: TData) => void;
  renderDetailRow?: (row: Row<TData>) => ReactNode;
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) =>
      "id" in row && typeof row.id === "string" ? row.id : String(index),
  });
  const visibleColumns = table.getVisibleLeafColumns();

  return (
    <table
      className={cn(
        "w-full table-fixed caption-bottom border-separate border-spacing-0 space-y-4 overflow-auto text-sm",
        presentation === "wide" && "min-w-[60rem] table-auto",
      )}
    >
      <thead
        className={cn(
          "[&_tr]:border-b",
          presentation === "dense" && "bg-background sticky top-0 z-10",
        )}
      >
        {table.getHeaderGroups().map((headerGroup) => (
          <tr
            key={headerGroup.id}
            className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors"
          >
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                className="bg-background text-muted-foreground relative h-10 border-b px-2 text-left align-middle font-bold [&:has([role=checkbox])]:pr-0"
                style={
                  header.column.columnDef.size === undefined
                    ? undefined
                    : { width: header.getSize() }
                }
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody
        className={cn(
          "text-xs [&_tr:last-child]:border-0",
          bodyTone === "muted" && "text-muted-foreground",
        )}
      >
        {isLoading ? (
          Array.from({ length: 3 }).map((_, rowIndex) => (
            <tr
              key={`loading-row-${rowIndex}`}
              aria-hidden="true"
              className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors"
            >
              {visibleColumns.map((column) => {
                const loadingCell = column.columnDef.loadingCell;
                return (
                  <td
                    key={column.id}
                    className={cn(
                      "h-full border-b align-middle [&:has([role=checkbox])]:pr-0 [:last-child_>_&]:border-b-0",
                      column.columnDef.cellPadding === "compact"
                        ? "px-2 py-0"
                        : "p-2",
                      column.columnDef.cellPadding === "none" && "p-0",
                    )}
                  >
                    {typeof loadingCell === "function" ? (
                      loadingCell()
                    ) : loadingCell !== undefined ? (
                      loadingCell
                    ) : (
                      <Skeleton className="h-4 w-1/2" />
                    )}
                  </td>
                );
              })}
            </tr>
          ))
        ) : table.getRowModel().rows.length === 0 ? (
          <tr className="hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors">
            <td
              colSpan={visibleColumns.length}
              className="h-full border-b p-2 text-center align-middle [&:has([role=checkbox])]:pr-0 [:last-child_>_&]:border-b-0"
            >
              {noResults}
            </td>
          </tr>
        ) : (
          table.getRowModel().rows.map((row) => (
            <Fragment key={row.id}>
              <tr
                className={cn(
                  "hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors",
                  onRowClick && "cursor-pointer",
                  presentation === "dense" && "text-xs",
                  rowVariant === "muted-hover" && "hover:bg-muted",
                  (rowVariant === "primary-hover" ||
                    rowVariant === "primary-hover-static") &&
                    "hover:bg-primary-foreground",
                  rowVariant === "primary-hover-static" && "cursor-default",
                  rowVariant === "review" && "group/row",
                  selectedRowId === row.id && "bg-muted",
                )}
                onClick={() => onRowClick?.(row.original)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onRowClick?.(row.original);
                }}
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      "h-full border-b align-middle [&:has([role=checkbox])]:pr-0 [:last-child_>_&]:border-b-0",
                      cell.column.columnDef.cellPadding === "compact"
                        ? "px-2 py-0"
                        : "p-2",
                      cell.column.columnDef.cellPadding === "none" && "p-0",
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
              {renderDetailRow?.(row)}
            </Fragment>
          ))
        )}
      </tbody>
    </table>
  );
}
