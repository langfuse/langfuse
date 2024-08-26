"use client";
import { type OrderByState } from "@langfuse/shared";
import React, { useState, useMemo } from "react";

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

interface DataTableProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  data: AsyncTableData<TData[]>;
  pagination?: {
    totalCount: number | null; // null if loading
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
  shouldRenderGroupHeaders?: boolean;
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
  shouldRenderGroupHeaders = false,
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
    pageCount:
      pagination?.totalCount === null ||
      pagination?.state.pageSize === undefined
        ? -1
        : Math.ceil(
            Number(pagination?.totalCount) / pagination?.state.pageSize,
          ),
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
    defaultColumn: {
      minSize: 20,
      size: 150,
      maxSize: Number.MAX_SAFE_INTEGER,
    },
    columnResizeMode: "onChange",
  });

  // memo column sizes for performance
  // https://tanstack.com/table/v8/docs/guide/column-sizing#advanced-column-resizing-performance
  const columnSizeVars = useMemo(() => {
    const headers = table.getFlatHeaders();
    const colSizes: { [key: string]: number } = {};
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]!;
      colSizes[`--header-${header.id}-size`] = header.getSize();
      colSizes[`--col-${header.column.id}-size`] = header.column.getSize();
    }
    return colSizes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    table.getState().columnSizingInfo,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    table.getState().columnSizing,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    table.getFlatHeaders(),
    columnVisibility,
  ]);

  const tableHeaders = shouldRenderGroupHeaders
    ? table.getHeaderGroups()
    : [table.getHeaderGroups().slice(-1)[0]];

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
          style={{ ...columnSizeVars }}
        >
          <Table>
            <TableHeader>
              {tableHeaders.map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const columnDef = header.column
                      .columnDef as LangfuseColumnDef<ModelTableRow>;
                    const sortingEnabled = columnDef.enableSorting;
                    return header.column.getIsVisible() ? (
                      <TableHead
                        key={header.id}
                        className={cn(
                          "group p-1 first:pl-2",
                          sortingEnabled && "cursor-pointer",
                        )}
                        style={{
                          width: `calc(var(--header-${header.id}-size) * 1px)`,
                        }}
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
                            <div className="flex select-none items-center">
                              <span className="truncate">
                                {flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                              </span>
                              {columnDef.headerTooltip && (
                                <DocPopup
                                  description={
                                    columnDef.headerTooltip.description
                                  }
                                  href={columnDef.headerTooltip.href}
                                />
                              )}
                              {orderBy?.column === columnDef.id
                                ? renderOrderingIndicator(orderBy)
                                : null}
                              <div
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onDoubleClick={() => header.column.resetSize()}
                                onMouseDown={header.getResizeHandler()}
                                onTouchStart={header.getResizeHandler()}
                                className={cn(
                                  "absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none bg-secondary opacity-0 group-hover:opacity-100",
                                  header.column.getIsResizing() &&
                                    "bg-primary-accent opacity-100",
                                )}
                              />
                            </div>
                          </>
                        )}
                      </TableHead>
                    ) : null;
                  })}
                </TableRow>
              ))}
            </TableHeader>
            {table.getState().columnSizingInfo.isResizingColumn ? (
              <MemoizedTableBody
                table={table}
                rowheighttw={rowheighttw}
                columns={columns}
                data={data}
                help={help}
              />
            ) : (
              <TableBodyComponent
                table={table}
                rowheighttw={rowheighttw}
                columns={columns}
                data={data}
                help={help}
              />
            )}
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
  if (!orderBy) return null;
  if (orderBy.order === "ASC") return <span className="ml-1">▲</span>;
  else return <span className="ml-1">▼</span>;
}

interface TableBodyComponentProps<TData> {
  table: ReturnType<typeof useReactTable<TData>>;
  rowheighttw?: string;
  columns: LangfuseColumnDef<TData, any>[];
  data: AsyncTableData<TData[]>;
  help?: { description: string; href: string };
}

function TableBodyComponent<TData>({
  table,
  rowheighttw,
  columns,
  data,
  help,
}: TableBodyComponentProps<TData>) {
  return (
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
                className={cn(
                  "overflow-hidden border-b p-1 text-xs first:pl-2",
                  rowheighttw === "s" && "whitespace-nowrap",
                )}
                style={{
                  width: `calc(var(--col-${cell.column.id}-size) * 1px)`,
                }}
              >
                <div className={cn("flex items-center", rowheighttw)}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              </TableCell>
            ))}
          </TableRow>
        ))
      ) : (
        <TableRow>
          <TableCell colSpan={columns.length} className="h-24 text-center">
            <div>
              No results.{" "}
              {help && (
                <DocPopup description={help.description} href={help.href} />
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}

// memo tables for performance, should only re-render when data changes
// https://tanstack.com/table/v8/docs/guide/column-sizing#advanced-column-resizing-performance
const MemoizedTableBody = React.memo(TableBodyComponent, (prev, next) => {
  return prev.table.options.data === next.table.options.data;
}) as typeof TableBodyComponent;
