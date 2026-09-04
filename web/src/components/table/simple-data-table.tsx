import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Row,
} from "@tanstack/react-table";
import { Fragment, type ReactNode } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
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
    <Table
      className={
        presentation === "wide" ? "min-w-[60rem] table-auto" : undefined
      }
    >
      <TableHeader
        className={
          presentation === "dense"
            ? "bg-background sticky top-0 z-10"
            : undefined
        }
      >
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
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
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody
        className={bodyTone === "muted" ? "text-muted-foreground" : undefined}
      >
        {isLoading ? (
          Array.from({ length: 3 }).map((_, rowIndex) => (
            <TableRow key={`loading-row-${rowIndex}`} aria-hidden="true">
              {visibleColumns.map((column) => {
                const loadingCell = column.columnDef.loadingCell;
                return (
                  <TableCell
                    key={column.id}
                    density={
                      column.columnDef.cellPadding === "compact"
                        ? "compact"
                        : "comfortable"
                    }
                    className={cn(
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
                  </TableCell>
                );
              })}
            </TableRow>
          ))
        ) : table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell
              density="comfortable"
              colSpan={visibleColumns.length}
              className="text-center"
            >
              {noResults}
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <Fragment key={row.id}>
              <TableRow
                className={cn(
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
                  <TableCell
                    key={cell.id}
                    density={
                      cell.column.columnDef.cellPadding === "compact"
                        ? "compact"
                        : "comfortable"
                    }
                    className={cn(
                      cell.column.columnDef.cellPadding === "none" && "p-0",
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
              {renderDetailRow?.(row)}
            </Fragment>
          ))
        )}
      </TableBody>
    </Table>
  );
}
