"use client";
import { type OrderByState } from "@langfuse/shared";
import React, {
  useState,
  useMemo,
  useCallback,
  type CSSProperties,
} from "react";
import DocPopup from "@/src/components/layouts/doc-popup";
import { DataTablePagination } from "@/src/components/table/data-table-pagination";
import {
  type CustomHeights,
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
  type ColumnPinningState,
  type Column,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnFiltersState,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type VisibilityState,
  type Row,
} from "@tanstack/react-table";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import isEqual from "lodash/isEqual";
import { useRouter } from "next/router";
import { useColumnSizing } from "@/src/components/table/hooks/useColumnSizing";

interface DataTableProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  data: AsyncTableData<TData[]>;
  pagination?: {
    totalCount: number | null; // null if loading
    onChange: OnChangeFn<PaginationState>;
    state: PaginationState;
    options?: number[];
    hideTotalCount?: boolean;
    canJumpPages?: boolean;
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
  noResultsMessage?: React.ReactNode;
  rowHeight?: RowHeight;
  customRowHeights?: CustomHeights;
  className?: string;
  shouldRenderGroupHeaders?: boolean;
  onRowClick?: (row: TData, event?: React.MouseEvent) => void;
  /** Used for row click handling and MemoizedTableBody snapshot only. Render <TablePeekView> as a sibling outside DataTable. */
  peekView?: DataTablePeekViewProps;
  hidePagination?: boolean;
  tableName: string;
  getRowClassName?: (row: TData) => string;
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
  noResultsMessage,
  orderBy,
  setOrderBy,
  rowHeight,
  customRowHeights,
  className,
  shouldRenderGroupHeaders = false,
  onRowClick,
  peekView,
  hidePagination = false,
  tableName,
  getRowClassName,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const rowheighttw = getRowHeightTailwindClass(rowHeight, customRowHeights);
  const capture = usePostHogClientCapture();
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

  const { columnSizing, setColumnSizing } = useColumnSizing(tableName);

  // Infer column pinning state from column properties
  const columnPinning = useMemo<ColumnPinningState>(
    () => ({
      left: columns
        .filter((col) => col.isPinnedLeft)
        .map((col) => col.id || col.accessorKey),
      right: [],
    }),
    [columns],
  );

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
      columnSizing,
      columnPinning,
    },
    onColumnSizingChange: setColumnSizing,
    manualFiltering: true,
    defaultColumn: {
      minSize: 20,
      size: 150,
      maxSize: Number.MAX_SAFE_INTEGER,
    },
    columnResizeMode: "onChange",
    autoResetPageIndex: false,
  });

  const handleOnRowClick = useCallback(
    (row: TData, event?: React.MouseEvent) => {
      // Call the table-specific onRowClick first (for modifier key handling)
      onRowClick?.(row, event);

      // If the table handler didn't prevent default, handle peek view
      if (peekView && !event?.defaultPrevented) {
        const rowId =
          "id" in row && typeof row.id === "string" ? row.id : undefined;
        peekView.openPeek?.(rowId, row);
      }
    },
    [onRowClick, peekView],
  );

  const hasRowClickAction = !!onRowClick || !!peekView?.openPeek;

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
          className={cn("relative min-h-full w-full overflow-auto border-t")}
          style={{ ...columnSizeVars }}
        >
          <Table>
            <TableHeader className="sticky top-0 z-20">
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
                          getPinningClasses(header.column),
                        )}
                        style={{
                          width,
                          ...getCommonPinningStyles(header.column),
                        }}
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
            {table.getState().columnSizingInfo.isResizingColumn ||
            !!peekView ? (
              <MemoizedTableBody
                table={table}
                rowheighttw={rowheighttw}
                rowHeight={rowHeight}
                columns={columns}
                data={data}
                help={help}
                noResultsMessage={noResultsMessage}
                onRowClick={hasRowClickAction ? handleOnRowClick : undefined}
                getRowClassName={getRowClassName}
                tableSnapshot={{
                  columnVisibility,
                  columnOrder,
                  rowSelection,
                }}
              />
            ) : (
              <TableBodyComponent
                table={table}
                rowheighttw={rowheighttw}
                rowHeight={rowHeight}
                columns={columns}
                data={data}
                help={help}
                noResultsMessage={noResultsMessage}
                onRowClick={hasRowClickAction ? handleOnRowClick : undefined}
                getRowClassName={getRowClassName}
              />
            )}
          </Table>
        </div>
      </div>
      {!hidePagination && pagination !== undefined ? (
        <div
          className={cn(
            "sticky bottom-0 z-10 flex w-full justify-end border-t bg-background py-2 pr-2 font-medium",
          )}
        >
          <DataTablePagination
            table={table}
            isLoading={data.isLoading}
            paginationOptions={pagination.options}
            hideTotalCount={pagination.hideTotalCount}
            canJumpPages={pagination.canJumpPages}
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
  rowHeight?: RowHeight;
  columns: LangfuseColumnDef<TData, any>[];
  data: AsyncTableData<TData[]>;
  help?: { description: string; href: string };
  noResultsMessage?: React.ReactNode;
  onRowClick?: (row: TData, event?: React.MouseEvent) => void;
  getRowClassName?: (row: TData) => string;
  tableSnapshot?: {
    columnVisibility?: VisibilityState;
    columnOrder?: ColumnOrderState;
    rowSelection?: RowSelectionState;
  };
}

function TableRowComponent<TData>({
  row,
  onRowClick,
  getRowClassName,
  children,
}: {
  row: Row<TData>;
  onRowClick?: (row: TData, event?: React.MouseEvent) => void;
  getRowClassName?: (row: TData) => string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const selectedRowId = router.query.peek as string | undefined;

  return (
    <TableRow
      data-row-index={row.index}
      onClick={(e) => onRowClick?.(row.original, e)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onRowClick?.(row.original);
        }
      }}
      className={cn(
        "hover:bg-accent",
        !!onRowClick ? "cursor-pointer" : "cursor-default",
        selectedRowId && selectedRowId === row.id ? "bg-accent" : undefined,
        getRowClassName?.(row.original),
      )}
    >
      {children}
    </TableRow>
  );
}

function TableBodyComponent<TData>({
  table,
  rowheighttw,
  rowHeight,
  columns,
  data,
  help,
  noResultsMessage,
  onRowClick,
  getRowClassName,
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
          <TableRowComponent
            key={row.id}
            row={row}
            onRowClick={onRowClick}
            getRowClassName={getRowClassName}
          >
            {row.getVisibleCells().map((cell) => {
              const cellValue = cell.getValue();
              const isStringCell = typeof cellValue === "string";
              const isSmallRowHeight = (rowHeight ?? "s") === "s";

              return (
                <TableCell
                  key={cell.id}
                  className={cn(
                    "overflow-hidden border-b px-1 text-xs first:pl-2",
                    isSmallRowHeight && "whitespace-nowrap",
                    getPinningClasses(cell.column),
                  )}
                  style={{
                    width: `calc(var(--col-${cell.column.id}-size) * 1px)`,
                    ...getCommonPinningStyles(cell.column),
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
                    {isStringCell && isSmallRowHeight ? (
                      <div className="min-w-0 truncate leading-none">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </div>
                    ) : isStringCell && !isSmallRowHeight ? (
                      <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden text-ellipsis">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </div>
                    ) : (
                      flexRender(cell.column.columnDef.cell, cell.getContext())
                    )}
                  </div>
                </TableCell>
              );
            })}
          </TableRowComponent>
        ))
      ) : (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={columns.length} className="h-24">
            <div className="pointer-events-none absolute left-[50%] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-center">
              {noResultsMessage ?? (
                <>
                  No results.{" "}
                  {help && (
                    <DocPopup description={help.description} href={help.href} />
                  )}
                </>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}

// Optimize table rendering performance by memoizing the table body
// This is critical for two high-frequency re-render scenarios:
// 1. During column resizing: When users drag column headers, it can trigger
//    many state updates that would otherwise cause the entire table to re-render.
// 2. When using peek views: URL/state changes from peek view navigation would
//    otherwise cause unnecessary table re-renders.
//
// We need to ensure the table re-renders when:
// - The actual data changes (including metrics loaded asynchronously and pagination state)
// - The loading state changes
// - The new column widths are computed
// - The row height changes
// - The number of visible cells changes
// - The column order changes
//
// See: https://tanstack.com/table/v8/docs/guide/column-sizing#advanced-column-resizing-performance
const MemoizedTableBody = React.memo(TableBodyComponent, (prev, next) => {
  if (!prev.tableSnapshot || !next.tableSnapshot)
    return !prev.tableSnapshot && !next.tableSnapshot;

  // Compare actual data arrays from the AsyncTableData prop.
  // prev.table.options.data won't work — TanStack Table returns a stable mutable instance.
  const prevDataArr =
    !prev.data.isLoading && !prev.data.isError ? prev.data.data : undefined;
  const nextDataArr =
    !next.data.isLoading && !next.data.isError ? next.data.data : undefined;
  if (prevDataArr !== nextDataArr) return false;
  if (prev.data.isLoading !== next.data.isLoading) return false;
  if (prev.rowheighttw !== next.rowheighttw) return false;
  if (prev.rowHeight !== next.rowHeight) return false;

  // Then do more expensive deep equality checks
  if (
    !isEqual(prev.tableSnapshot.rowSelection, next.tableSnapshot.rowSelection)
  )
    return false;
  if (
    !isEqual(
      prev.tableSnapshot.columnVisibility,
      next.tableSnapshot.columnVisibility,
    )
  )
    return false;
  if (!isEqual(prev.tableSnapshot.columnOrder, next.tableSnapshot.columnOrder))
    return false;

  // If all checks pass, components are equal
  return true;
}) as typeof TableBodyComponent;
