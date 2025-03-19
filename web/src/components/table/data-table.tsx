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
  type ColumnOrderState,
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
import { useRouter } from "next/router";
import {
  TablePeekView,
  type DataTablePeekViewProps,
} from "@/src/components/table/peek";

type PeekViewProps<TData> = Omit<
  DataTablePeekViewProps<TData>,
  "selectedRowId"
>;

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
  columnOrder?: ColumnOrderState;
  onColumnOrderChange?: OnChangeFn<ColumnOrderState>;
  orderBy?: OrderByState;
  setOrderBy?: (s: OrderByState) => void;
  help?: { description: string; href: string };
  rowHeight?: RowHeight;
  className?: string;
  shouldRenderGroupHeaders?: boolean;
  onRowClick?: (row: TData) => void;
  peekView?: PeekViewProps<TData>;
  pinFirstColumn?: boolean;
}

export interface AsyncTableData<T> {
  isLoading: boolean;
  isError: boolean;
  data?: T;
  error?: string;
}

function insertArrayAfterKey(array: string[], toInsert: Map<string, string[]>) {
  return array.reduce<string[]>((acc, key) => {
    if (toInsert.has(key)) {
      acc.push(...toInsert.get(key)!);
    } else {
      acc.push(key);
    }

    return acc;
  }, []);
}

function isValidCssVariableName({
  name,
  includesHyphens = true,
}: {
  name: string;
  includesHyphens?: boolean;
}) {
  const regex = includesHyphens
    ? /^--(?![0-9])([a-zA-Z][a-zA-Z0-9-_]*)$/
    : /^(?![0-9])([a-zA-Z][a-zA-Z0-9-_]*)$/;
  return regex.test(name);
}

export function DataTable<TData extends object, TValue>({
  columns,
  data,
  pagination,
  rowSelection,
  setRowSelection,
  columnVisibility,
  onColumnVisibilityChange,
  columnOrder,
  onColumnOrderChange,
  help,
  orderBy,
  setOrderBy,
  rowHeight,
  className,
  shouldRenderGroupHeaders = false,
  onRowClick,
  peekView,
  pinFirstColumn = false,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const rowheighttw = getRowHeightTailwindClass(rowHeight);
  const capture = usePostHogClientCapture();
  const router = useRouter();
  const peekViewId = router.query.peek as string | undefined;

  const flattedColumnsByGroup = useMemo(() => {
    const flatColumnsByGroup = new Map<string, string[]>();

    columns.forEach((col) => {
      if (col.columns && Boolean(col.columns.length)) {
        const children = col.columns.map((child) => child.accessorKey);
        flatColumnsByGroup.set(col.accessorKey, children);
      }
    });
    return flatColumnsByGroup;
  }, [columns]);

  const handleOnRowClick = (row: TData) => {
    if (peekView) {
      const rowId =
        "id" in row && typeof row.id === "string" ? row.id : undefined;

      // If clicking the same row that's already open, close it
      if (rowId === peekViewId) {
        peekView.onOpenChange(false);
      }
      // If clicking a different row, update without closing first
      else {
        peekView.onOpenChange(true, row);
      }
    }
    onRowClick?.(row);
  };
  const hasRowClickAction = !!onRowClick || !!peekView;

  const table = useReactTable({
    data: data.data ?? [],
    columns,
    onColumnFiltersChange: setColumnFilters,
    onColumnOrderChange: onColumnOrderChange,
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
      columnOrder: columnOrder
        ? insertArrayAfterKey(columnOrder, flattedColumnsByGroup)
        : undefined,
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
          "flex w-full max-w-full flex-1 flex-col overflow-auto",
          className,
        )}
      >
        <div
          className={cn("relative w-full overflow-auto border-t")}
          style={{ ...columnSizeVars }}
        >
          <Table>
            <TableHeader className="sticky top-0 z-10">
              {tableHeaders.map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const columnDef = header.column
                      .columnDef as LangfuseColumnDef<ModelTableRow>;
                    const sortingEnabled = columnDef.enableSorting;
                    // if the header id does not translate to a valid css variable name, default to 150px as width
                    // may only happen for dynamic columns, as column names are user defined
                    const width = isValidCssVariableName({
                      name: header.id,
                      includesHyphens: false,
                    })
                      ? `calc(var(--header-${header.id}-size) * 1px)`
                      : 150;

                    return header.column.getIsVisible() ? (
                      <TableHead
                        key={header.id}
                        className={cn(
                          "group p-1 first:pl-2",
                          sortingEnabled && "cursor-pointer",
                          pinFirstColumn &&
                            header.index === 0 &&
                            "sticky left-0 z-20 border-r bg-background",
                        )}
                        style={{ width }}
                        onClick={(event) => {
                          event.preventDefault();

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
                onRowClick={hasRowClickAction ? handleOnRowClick : undefined}
                peekViewId={peekViewId}
                pinFirstColumn={pinFirstColumn}
              />
            ) : (
              <TableBodyComponent
                table={table}
                rowheighttw={rowheighttw}
                columns={columns}
                data={data}
                help={help}
                onRowClick={hasRowClickAction ? handleOnRowClick : undefined}
                peekViewId={peekViewId}
                pinFirstColumn={pinFirstColumn}
              />
            )}
          </Table>
        </div>
        <div className="grow"></div>
      </div>
      {peekView && peekViewId && (
        <TablePeekView selectedRowId={peekViewId} {...peekView} />
      )}
      {pagination !== undefined ? (
        <div
          className={cn(
            "sticky bottom-0 z-10 flex w-full justify-end border-t bg-background py-2 pr-2 font-medium",
          )}
        >
          <DataTablePagination
            table={table}
            isLoading={data.isLoading}
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
  else
    return (
      <span className="ml-1" title="Sort by this column">
        ▼
      </span>
    );
}

interface TableBodyComponentProps<TData> {
  table: ReturnType<typeof useReactTable<TData>>;
  rowheighttw?: string;
  columns: LangfuseColumnDef<TData, any>[];
  data: AsyncTableData<TData[]>;
  help?: { description: string; href: string };
  onRowClick?: (row: TData) => void;
  peekViewId?: string;
  pinFirstColumn?: boolean;
}

function TableBodyComponent<TData>({
  table,
  rowheighttw,
  columns,
  data,
  help,
  onRowClick,
  peekViewId,
  pinFirstColumn = false,
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
          <TableRow
            key={row.id}
            data-row-index={row.index}
            onClick={() => onRowClick?.(row.original)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRowClick?.(row.original);
              }
            }}
            className={cn(
              "hover:bg-accent",
              !!onRowClick ? "cursor-pointer" : "cursor-default",
              peekViewId && peekViewId === row.id ? "bg-accent" : undefined,
            )}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={cn(
                  "overflow-hidden border-b p-1 text-xs first:pl-2",
                  rowheighttw === "s" && "whitespace-nowrap",
                  pinFirstColumn &&
                    cell.column.getIndex() === 0 &&
                    "sticky left-0 border-r bg-background",
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
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={columns.length} className="h-24">
            <div className="pointer-events-none absolute left-[50%] flex -translate-y-1/2 items-center justify-center">
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
