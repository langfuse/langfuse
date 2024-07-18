"use client";
import { type OrderByState } from "@langfuse/shared";

import DocPopup from "@/src/components/layouts/doc-popup";
import { DataTablePagination } from "@/src/components/table/data-table-pagination";
import {
  type RowHeight,
  getRowHeightTailwindClass,
} from "@/src/components/table/data-table-row-height-switch";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type ModelTableRow } from "@/src/components/table/use-cases/models";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { cn } from "@/src/utils/tailwind";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnFiltersState,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useState } from "react";

interface DataTableProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  data: AsyncTableData<TData[]>;
  pagination?: {
    pageCount: number;
    onChange: OnChangeFn<PaginationState>;
    state: PaginationState;
    options?: number[];
  };
  rowSelection?: RowSelectionState;
  setRowSelection?: OnChangeFn<RowSelectionState>;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  orderBy?: OrderByState;
  setOrderBy?: (s: OrderByState) => void;
  help?: { description: string; href: string };
  rowHeight?: RowHeight;
  className?: string;
  paginationClassName?: string;
  isBorderless?: boolean;
}

export interface AsyncTableData<T> {
  isLoading: boolean;
  isError: boolean;
  data?: T;
  error?: string;
}

export function DataTable<TData extends object, TValue>({
  columns,
  data,
  pagination,
  rowSelection,
  setRowSelection,
  columnVisibility,
  onColumnVisibilityChange,
  help,
  orderBy,
  setOrderBy,
  rowHeight,
  className,
  paginationClassName,
  isBorderless = false,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const rowheighttw = getRowHeightTailwindClass(rowHeight);
  const capture = usePostHogClientCapture();

  const table = useReactTable({
    data: data.data ?? [],
    columns,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getCoreRowModel: getCoreRowModel(),
    manualPagination: pagination !== undefined,
    pageCount: pagination?.pageCount ?? 0,
    onPaginationChange: pagination?.onChange,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: onColumnVisibilityChange,
    getRowId: (row, index) => {
      if ("id" in row && typeof row.id === "string") {
        return row.id;
      } else {
        return index.toString();
      }
    },
    state: {
      columnFilters,
      pagination: pagination?.state,
      columnVisibility,
      rowSelection,
    },
    manualFiltering: true,
  });

  return (
    <>
      <div
        className={cn(
          "flex w-full max-w-full flex-1 flex-col gap-1 overflow-auto",
          className,
        )}
      >
        <div
          className={cn(
            "w-full overflow-auto",
            isBorderless ? "" : "rounded-md border",
          )}
        >
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const columnDef = header.column
                      .columnDef as LangfuseColumnDef<ModelTableRow>;
                    const sortingEnabled = columnDef.enableSorting;
                    return header.column.getIsVisible() ? (
                      <TableHead
                        key={header.id}
                        className={cn(
                          sortingEnabled ? "cursor-pointer" : null,
                          "whitespace-nowrap p-2",
                        )}
                        title={sortingEnabled ? "Sort by this column" : ""}
                        onClick={(event) => {
                          event.preventDefault(); // Add this line

                          if (!setOrderBy || !columnDef.id || !sortingEnabled) {
                            return;
                          }

                          if (orderBy?.column === columnDef.id) {
                            if (orderBy.order === "DESC") {
                              capture("table:column_sorting_header_click", {
                                column: columnDef.id,
                                order: "ASC",
                              });
                              setOrderBy({
                                column: columnDef.id,
                                order: "ASC",
                              });
                            } else {
                              capture("table:column_sorting_header_click", {
                                column: columnDef.id,
                                order: "Disabled",
                              });
                              setOrderBy(null);
                            }
                          } else {
                            capture("table:column_sorting_header_click", {
                              column: columnDef.id,
                              order: "DESC",
                            });
                            setOrderBy({
                              column: columnDef.id,
                              order: "DESC",
                            });
                          }
                        }}
                      >
                        {header.isPlaceholder ? null : (
                          <>
                            <div className="select-none">
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}

                              {columnDef.headerTooltip && (
                                <DocPopup
                                  description={
                                    columnDef.headerTooltip.description
                                  }
                                  href={columnDef.headerTooltip.href}
                                  size="xs"
                                />
                              )}

                              {orderBy?.column === columnDef.id
                                ? renderOrderingIndicator(orderBy)
                                : null}
                            </div>
                          </>
                        )}
                      </TableHead>
                    ) : null;
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {data.isLoading || !data.data ? (
                <TableRow className="h-svh">
                  <TableCell
                    colSpan={columns.length}
                    className="content-start border-b text-center"
                  >
                    Loading...
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="overflow-hidden whitespace-nowrap border-b px-2 py-1 text-xs first:pl-2"
                      >
                        <div className={cn("flex items-center", rowheighttw)}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </div>
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    <div>
                      No results.{" "}
                      {help && (
                        <DocPopup
                          description={help.description}
                          href={help.href}
                          size="sm"
                        />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="grow"></div>
      </div>
      {pagination !== undefined ? (
        <div
          className={cn(
            "sticky bottom-0 z-10 flex w-full justify-end bg-background font-medium",
            paginationClassName,
          )}
        >
          <DataTablePagination
            table={table}
            paginationOptions={pagination.options}
          />
        </div>
      ) : null}
    </>
  );
}

function renderOrderingIndicator(orderBy?: OrderByState) {
  if (!orderBy) return;
  if (orderBy.order === "ASC") return <span className="ml-1">▲</span>;
  else return <span className="ml-1">▼</span>;
}
