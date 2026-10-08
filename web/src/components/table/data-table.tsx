/* eslint-disable no-nested-ternary */
/* eslint-disable @repo/no-style-props */
"use client";
import { type OrderByState } from "@langfuse/shared";
import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  type CSSProperties,
  type UIEventHandler,
} from "react";
import DocPopup from "@/src/components/layouts/doc-popup";
import { DataTablePagination } from "@/src/components/table/data-table-pagination";
import { shouldIgnoreRowClickTarget } from "@/src/components/table/shouldIgnoreRowClickTarget";
import { getPlainTextFromReactNode } from "@/src/utils/react-node-plain-text";
import {
  type CustomHeights,
  type RowHeight,
  MAX_CUSTOM_ROW_HEIGHT_PX,
  MIN_CUSTOM_ROW_HEIGHT_PX,
  RowHeightRenderingProvider,
  clampCustomRowHeightPx,
  getRowHeightTailwindClass,
  resolveRowHeightRendering,
} from "@/src/components/table/data-table-row-height-switch";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  type DataTableCellBackground,
  type DataTableCellPadding,
  type LangfuseColumnDef,
} from "@/src/components/table/types";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
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

import { useAnimatedBusy } from "@/src/hooks/useAnimatedBusy";
import {
  type TableSelectionStoreLike,
  useTableRowIsSelected,
  useTableSelectAll,
} from "@/src/components/table/table-selection-store";

interface DataTableProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  onScroll?: UIEventHandler<HTMLDivElement>;
  data: AsyncTableData<TData[]>;
  /**
   * A fetch is in flight while rows are already on screen (refresh, filter,
   * page, sort). Renders a thin bar above the header instead of blanking the
   * table: `data.isLoading` stays reserved for a genuine cold load.
   */
  isFetching?: boolean;
  pagination?: {
    totalCount: number | null; // null if loading or intentionally unknown
    /**
     * The exact count is still in flight while rows are already on screen (its
     * query re-keys on a filter change one step behind the rows). Renders the
     * page count as loading rather than as a result.
     */
    isTotalCountLoading?: boolean;
    hasNextPage?: boolean;
    onChange: OnChangeFn<PaginationState>;
    state: PaginationState;
    options?: number[];
    hideTotalCount?: boolean;
    canJumpPages?: boolean;
    /**
     * Approximate row/entity count matching the active filters. Rendered near
     * the pagination controls, but ONLY when the result set spans more than one
     * page: a single (last) page shows the EXACT total derived from the loaded
     * rows instead (no "≈"). Distinct from `totalCount` (which drives page-count
     * math): a cheap estimate shown for context only. `null` while loading.
     */
    approxTotalCount?: number | null;
    isApproxTotalCountLoading?: boolean;
    /**
     * True when the approximate count dropped non-native filters (score/comment/
     * input-output/full-text search) and so over-counts vs the visible rows.
     * The footer then marks the estimate partial-scope and drops the
     * "within a few percent" tooltip.
     */
    approxTotalCountIsPartialScope?: boolean;
  };
  rowSelection?: RowSelectionState;
  setRowSelection?: OnChangeFn<RowSelectionState>;
  /** External selection store; row highlight/checkbox state reads from it instead of TanStack rowSelection */
  selectionStore?: TableSelectionStoreLike;
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
  /**
   * Free height in pixels. When set, it replaces the preset class on every
   * row, so a drag in one run column stays aligned with the others.
   */
  customRowHeightPx?: number | null;
  /**
   * Dragging a row edge commits a free height. Omit on tables that should
   * stay on presets, including embedded previews that force a small row.
   */
  onCustomRowHeightChange?: (heightPx: number) => void;
  className?: string;
  shouldRenderGroupHeaders?: boolean;
  onRowClick?: (row: TData, event?: React.MouseEvent) => void;
  renderRow?: (props: {
    row: Row<TData>;
    children: React.ReactNode;
  }) => React.ReactNode;
  /** Used for row click handling and MemoizedTableBody snapshot only. Render <TablePeekView> as a sibling outside DataTable. */
  peekView?: DataTablePeekViewProps;
  footer?: React.ReactNode;
  hidePagination?: boolean;
  tableName: string;
  getRowClassName?: (row: TData) => string;
  highlightAllRows?: boolean;
  topAlignCells?: boolean;
  cellPadding?: DataTableCellPadding;
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
  const coversRightScrollbarGutter =
    isPinned === "right" && column.getIsLastColumn("right");

  return {
    left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
    right: isPinned === "right" ? `${column.getAfter("right")}px` : undefined,
    position: isPinned ? "sticky" : "relative",
    width: column.getSize(),
    zIndex: isPinned ? 10 : 0,
    backgroundColor: isPinned
      ? "var(--surface-context, hsl(var(--background)))"
      : undefined,
    // Repeated outer shadows paint through the stable scrollbar gutter even
    // when a table cell clips its contents. Only the outermost right-pinned
    // column owns them, so adjacent pinned columns retain their normal offsets.
    boxShadow: coversRightScrollbarGutter
      ? [
          "16px 0 0 hsl(var(--background))",
          "32px 0 0 hsl(var(--background))",
          "48px 0 0 hsl(var(--background))",
        ].join(", ")
      : undefined,
  };
};

// Get additional CSS classes for pinned columns
const getPinningClasses = <TData,>(column: Column<TData>): string => {
  const isPinned = column.getIsPinned();
  const isLastLeftPinnedColumn =
    isPinned === "left" && column.getIsLastColumn("left");

  return cn(isLastLeftPinnedColumn && "border-r border-border");
};

const getCellPaddingClassName = (padding: DataTableCellPadding) => {
  switch (padding) {
    case "comfortable":
      return "p-1";
    case "none":
      return "p-0 first:pl-0";
    case "compact":
      return "px-1";
  }
};

const cellBackgroundClassNames = {
  gray: "bg-muted/50 [&_[data-slot=skeleton]]:bg-muted-foreground/20",
  green: "bg-surface-output [&_[data-slot=skeleton]]:bg-muted-foreground/20",
} satisfies Record<DataTableCellBackground, string>;

const getCellBackgroundClassName = (background?: DataTableCellBackground) =>
  background ? cellBackgroundClassNames[background] : undefined;

export function DataTable<TData extends object, TValue>({
  columns,
  onScroll,
  data,
  isFetching = false,
  pagination,
  rowSelection,
  setRowSelection,
  selectionStore,
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
  customRowHeightPx,
  onCustomRowHeightChange,
  className,
  shouldRenderGroupHeaders = false,
  onRowClick,
  renderRow,
  peekView,
  footer,
  hidePagination = false,
  tableName,
  getRowClassName,
  highlightAllRows = false,
  topAlignCells = false,
  cellPadding = "compact",
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const rowheighttw = getRowHeightTailwindClass(rowHeight, customRowHeights);
  const rowHeightPx = customRowHeightPx ?? undefined;
  const rowResizeEnabled = onCustomRowHeightChange != null;
  const onCustomRowHeightChangeRef = useRef(onCustomRowHeightChange);
  onCustomRowHeightChangeRef.current = onCustomRowHeightChange;
  const capture = usePostHogClientCapture();
  const commitCustomRowHeight = useCallback(
    (heightPx: number) => {
      capture("table:row_height_switch_select", {
        rowHeight: "custom",
        heightPx,
        tableName,
      });
      onCustomRowHeightChangeRef.current?.(heightPx);
    },
    [capture, tableName],
  );
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

  // Releasing a column-resize drag fires a synthetic `click` on the underlying
  // header (the resize handle is a child of <TableHead>), which would otherwise
  // toggle the column sort. We stamp the resized column + time when a resize
  // ends and ignore a header click only on that same column within a short
  // window after it — so a deliberate sort click on a *different* header right
  // after a resize is not dropped. The stamp is set from a document listener
  // registered on resize start, so it fires before the click regardless of
  // where the pointer is released.
  const lastColumnResizeEndRef = useRef<{ columnId: string; at: number }>({
    columnId: "",
    at: 0,
  });
  // Removes the in-flight resize listener pair; cleared once it has run so we
  // never leak listeners if the table unmounts mid-drag.
  const activeResizeCleanupRef = useRef<(() => void) | null>(null);
  const beginColumnResize = useCallback(
    (columnId: string, handler: (event: unknown) => void) =>
      (event: React.MouseEvent | React.TouchEvent) => {
        handler(event);
        // Drop any listener pair still attached from a prior resize.
        activeResizeCleanupRef.current?.();
        const onResizeEnd = () => {
          lastColumnResizeEndRef.current = { columnId, at: Date.now() };
          cleanup();
        };
        const cleanup = () => {
          document.removeEventListener("mouseup", onResizeEnd);
          document.removeEventListener("touchend", onResizeEnd);
          activeResizeCleanupRef.current = null;
        };
        activeResizeCleanupRef.current = cleanup;
        document.addEventListener("mouseup", onResizeEnd);
        document.addEventListener("touchend", onResizeEnd);
      },
    [],
  );
  // Detach any in-flight resize listeners if the table unmounts mid-drag.
  useEffect(() => () => activeResizeCleanupRef.current?.(), []);

  // Infer column pinning state from column properties
  const columnPinning = useMemo<ColumnPinningState>(
    () => ({
      left: columns
        .filter((col) => col.isPinnedLeft)
        .map((col) => col.id || col.accessorKey),
      right: columns
        .filter((col) => col.isPinnedRight)
        .map((col) => col.id || col.accessorKey),
    }),
    [columns],
  );

  // Some high-volume tables intentionally skip an exact count query and only
  // return whether the current page has a next page. TanStack still needs a
  // synthetic pageCount to enable/disable navigation and to reuse its generic
  // out-of-range page reset behavior.
  const paginationPageCount = (() => {
    if (!pagination || pagination.state.pageSize === undefined) {
      return -1;
    }
    if (pagination.totalCount !== null) {
      return Math.ceil(
        Number(pagination.totalCount) / pagination.state.pageSize,
      );
    }
    if (typeof pagination.hasNextPage !== "boolean") {
      return -1;
    }
    if (
      !data.isLoading &&
      !data.isError &&
      (data.data?.length ?? 0) === 0 &&
      pagination.state.pageIndex > 0 &&
      !pagination.hasNextPage
    ) {
      return pagination.state.pageIndex;
    }
    return pagination.state.pageIndex + (pagination.hasNextPage ? 2 : 1);
  })();

  const table = useReactTable({
    data: data.data ?? [],
    columns,
    onColumnFiltersChange: setColumnFilters,
    onColumnOrderChange: onColumnOrderChange,
    getFilteredRowModel: getFilteredRowModel(),
    getCoreRowModel: getCoreRowModel(),
    manualPagination: pagination !== undefined,
    pageCount: paginationPageCount,
    onPaginationChange: pagination?.onChange,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: onColumnVisibilityChange,
    getRowId: (row, index) => {
      if ("id" in row && typeof row.id === "string") {
        return row.id;
      }
      return index.toString();
    },
    state: {
      columnFilters,
      pagination: pagination?.state,
      columnVisibility,
      columnOrder: columnOrder
        ? insertArrayAfterKey(columnOrder, flattedColumnsByGroup)
        : undefined,
      rowSelection: rowSelection ?? {},
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

  // Held for whole sweeps of the bar's animation: a 200ms refetch would
  // otherwise flash a single frame.
  // Cycle length matches the sweep, so a held refresh ends on a whole sweep.
  const refetchBar = useAnimatedBusy(isFetching, REFETCH_SWEEP_MS);

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
          // When the final visible column can be resized, reserve a small gutter so
          // its handle is never flush against the scrollbar or edge and always has
          // some cursor room. Partial mitigation for LFE-10460: a maximized browser
          // still clamps the cursor at the screen edge.
          className={cn(
            "relative min-h-full w-full overflow-auto border-t [scrollbar-gutter:stable]",
            table.getVisibleLeafColumns().at(-1)?.getCanResize() && "pr-2",
            // Room for the last row's resize strip, which hangs 3px below the table.
            onCustomRowHeightChange != null && "pb-[3px]",
          )}
          style={{ ...columnSizeVars }}
          onScroll={onScroll}
        >
          {/* Zero-height so an arriving refetch never shifts the table. Sticky on
              BOTH axes: this box is only as wide as the visible area, so without
              `left-0` it scrolls out of view on a table wider than the viewport.
              Keyed per busy period, not per fetch: one sweep from the left per
              refresh, and no restart between a refresh's stages. */}
          <div className="sticky top-0 left-0 z-30 h-0">
            <TableRefetchBar
              key={refetchBar.epoch}
              active={refetchBar.active && !data.isLoading}
            />
          </div>
          <Table>
            <TableHeader className="sticky top-0 z-20">
              {tableHeaders.map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const columnDef = header.column
                      .columnDef as LangfuseColumnDef<unknown>;
                    const sortingEnabled = columnDef.enableSorting;
                    // if the header id does not translate to a valid css variable name, default to 150px as width
                    // may only happen for dynamic columns, as column names are user defined
                    const width = (() => {
                      if (columnDef.isFlexWidth) {
                        return "auto";
                      }
                      if (
                        isValidCssVariableName({
                          name: header.id,
                          includesHyphens: false,
                        })
                      ) {
                        return `calc(var(--header-${header.id}-size) * 1px)`;
                      }
                      return 150;
                    })();

                    return header.column.getIsVisible() ? (
                      <TableHead
                        key={header.id}
                        className={cn(
                          "group p-1 first:pl-2",
                          sortingEnabled && "cursor-pointer",
                          getPinningClasses(header.column),
                          columnDef.headerClassName,
                          columnDef.hideBelowMd && "hidden md:table-cell",
                        )}
                        style={{
                          ...getCommonPinningStyles(header.column),
                          width,
                        }}
                        onClick={(event) => {
                          event.preventDefault();

                          // Ignore the click synthesized when this column's own
                          // resize drag is released over its header (other
                          // headers stay clickable during that window).
                          const lastResize = lastColumnResizeEndRef.current;
                          if (
                            lastResize.columnId === header.column.id &&
                            Date.now() - lastResize.at < 250
                          ) {
                            return;
                          }

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
                          <div
                            className={cn(
                              "flex select-none",
                              columnDef.headerBlock
                                ? "items-start"
                                : "items-center",
                            )}
                          >
                            {columnDef.headerBlock ? (
                              // Opted out of the single truncated line, so a
                              // header can carry more than the column's name.
                              <div className="min-w-0 flex-1 leading-normal">
                                {flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                              </div>
                            ) : (
                              <span
                                className="truncate leading-normal"
                                title={getPlainTextFromReactNode(
                                  flexRender(
                                    header.column.columnDef.header,
                                    header.getContext(),
                                  ),
                                )}
                              >
                                {flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                              </span>
                            )}
                            {columnDef.headerTooltip && (
                              <DocPopup
                                description={
                                  columnDef.headerTooltip.description
                                }
                                href={columnDef.headerTooltip.href}
                              />
                            )}
                            {sortingEnabled && orderBy?.column === columnDef.id
                              ? renderOrderingIndicator(orderBy)
                              : null}

                            <div
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onDoubleClick={() => header.column.resetSize()}
                              onMouseDown={beginColumnResize(
                                header.column.id,
                                header.getResizeHandler(),
                              )}
                              onTouchStart={beginColumnResize(
                                header.column.id,
                                header.getResizeHandler(),
                              )}
                              className={cn(
                                "bg-secondary absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none opacity-0 select-none group-hover:opacity-100",
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
                rowHeightPx={rowHeightPx}
                customRowHeights={customRowHeights}
                rowResizeEnabled={rowResizeEnabled}
                onCommitRowHeight={commitCustomRowHeight}
                columns={columns}
                data={data}
                help={help}
                noResultsMessage={noResultsMessage}
                onRowClick={hasRowClickAction ? handleOnRowClick : undefined}
                renderRow={renderRow}
                getRowClassName={getRowClassName}
                highlightAllRows={highlightAllRows}
                selectionStore={selectionStore}
                topAlignCells={topAlignCells}
                cellPadding={cellPadding}
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
                rowHeightPx={rowHeightPx}
                customRowHeights={customRowHeights}
                rowResizeEnabled={rowResizeEnabled}
                onCommitRowHeight={commitCustomRowHeight}
                columns={columns}
                data={data}
                help={help}
                noResultsMessage={noResultsMessage}
                onRowClick={hasRowClickAction ? handleOnRowClick : undefined}
                renderRow={renderRow}
                getRowClassName={getRowClassName}
                highlightAllRows={highlightAllRows}
                selectionStore={selectionStore}
                topAlignCells={topAlignCells}
                cellPadding={cellPadding}
              />
            )}
            {footer ? (
              <TableFooter className="bg-transparent">
                <TableRow>
                  <TableCell
                    className="h-12 text-center"
                    colSpan={table.getVisibleLeafColumns().length}
                  >
                    {footer}
                  </TableCell>
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </div>
      </div>
      {!hidePagination && pagination !== undefined ? (
        <div className="bg-surface sticky bottom-0 z-10 flex w-full justify-end border-t py-2 pr-2 font-bold">
          <DataTablePagination
            table={table}
            isLoading={
              data.isLoading || (pagination.isTotalCountLoading ?? false)
            }
            paginationOptions={pagination.options}
            hideTotalCount={pagination.hideTotalCount}
            canJumpPages={pagination.canJumpPages}
            approxTotalCount={pagination.approxTotalCount}
            isApproxTotalCountLoading={pagination.isApproxTotalCountLoading}
            approxTotalCountIsPartialScope={
              pagination.approxTotalCountIsPartialScope
            }
            hasNextPage={pagination.hasNextPage}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * One sweep of the refetch bar. The single source of truth for the cycle: it is
 * handed to the CSS animation as `--table-refetch-cycle` (see
 * `--animate-table-refetch` in globals.css, which reads it with a fallback), and
 * to `useAnimatedBusy` so the busy flag is only released on a whole sweep.
 */
const REFETCH_SWEEP_MS = 1400;

/**
 * The thin bar shown while a fetch runs over rows that are already on screen.
 * Both edges are soft: the sweep is already running when the bar fades in (a
 * one-shot fade rides on the sweep animation), and on the way out it fades
 * first and only stops animating once that fade has finished. Mounted once per
 * busy period — the caller keys it — so the sweep always starts from the left,
 * and it never leaves an animation running behind an invisible bar.
 */
function TableRefetchBar({ active }: { active: boolean }) {
  // The sweep runs only while the bar is on screen, plus the fade-out it has to
  // survive. A bar that mounts idle — every table that passes no `isFetching`,
  // and any table whose first render has nothing in flight — must never start it,
  // and one that has faded out must stop. But `active` can also turn on within a
  // single mount (a cold load holds it off until the skeletons go), so this
  // cannot simply latch on the first render.
  const [everActive, setEverActive] = useState(active);
  const [fadedOut, setFadedOut] = useState(false);

  if (active && !everActive) setEverActive(true);

  const paused = !active && (!everActive || fadedOut);

  return (
    // Clipped track: the highlight sweeps out of view at both ends, and
    // overflow-hidden keeps that from growing the table's scroll width. The fade
    // uses an arbitrary transition, not `duration-*` — that utility sets
    // --tw-duration, which `animate-*` reads as its animation-duration too, and
    // turned the sweep into a strobe.
    <div
      aria-hidden="true"
      onTransitionEnd={(event) => {
        if (event.propertyName === "opacity" && !active) setFadedOut(true);
      }}
      className={cn(
        "animate-table-refetch-in absolute inset-x-0 top-0 h-0.5 overflow-hidden [transition:opacity_200ms_ease-out]",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      {/* Faint track, so the bar reads as one continuous element rather than a
          highlight flashing in and out of nothing. Its own element: `cn` folds
          two `bg-*` utilities into one and would drop it. */}
      <div className="bg-primary-accent/20 absolute inset-0" />
      <div
        style={
          { "--table-refetch-cycle": `${REFETCH_SWEEP_MS}ms` } as CSSProperties
        }
        className={cn(
          "animate-table-refetch from-primary-accent/0 via-primary-accent to-primary-accent/0 absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r",
          paused && "[animation-play-state:paused]",
        )}
      />
    </div>
  );
}

function renderOrderingIndicator(orderBy?: OrderByState) {
  if (!orderBy) return null;
  const ascending = orderBy.order === "ASC";
  return (
    <span className="ml-1 inline-flex shrink-0 items-center">
      <svg
        viewBox="0 0 24 24"
        className="icon-base text-icon-foreground fill-current"
        aria-hidden="true"
      >
        <path d={ascending ? "M7 14h10l-5-6z" : "M7 10h10l-5 6z"} />
      </svg>
      <span className="sr-only">
        {ascending ? "sorted ascending" : "sorted descending"}
      </span>
    </span>
  );
}

interface TableBodyComponentProps<TData> {
  table: ReturnType<typeof useReactTable<TData>>;
  rowheighttw?: string;
  rowHeight?: RowHeight;
  rowHeightPx?: number;
  customRowHeights?: CustomHeights;
  rowResizeEnabled?: boolean;
  onCommitRowHeight?: (heightPx: number) => void;
  columns: LangfuseColumnDef<TData, any>[];
  data: AsyncTableData<TData[]>;
  help?: { description: string; href: string };
  noResultsMessage?: React.ReactNode;
  onRowClick?: (row: TData, event?: React.MouseEvent) => void;
  renderRow?: (props: {
    row: Row<TData>;
    children: React.ReactNode;
  }) => React.ReactNode;
  getRowClassName?: (row: TData) => string;
  highlightAllRows?: boolean;
  selectionStore?: TableSelectionStoreLike;
  topAlignCells?: boolean;
  cellPadding?: DataTableCellPadding;
  /** Used for React.memo comparison only */
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
  highlightAllRows = false,
  selectionStore,
  children,
}: {
  row: Row<TData>;
  onRowClick?: (row: TData, event?: React.MouseEvent) => void;
  getRowClassName?: (row: TData) => string;
  highlightAllRows?: boolean;
  selectionStore?: TableSelectionStoreLike;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const selectedRowId = router.query.peek as string | undefined;
  const rowIsSelected = useTableRowIsSelected(
    selectionStore,
    row.id,
    row.getIsSelected(),
  );
  const shouldHighlightAllRows = useTableSelectAll(
    selectionStore,
    highlightAllRows,
  );

  return (
    <TableRow
      data-row-index={row.index}
      onClick={(e) => {
        if (shouldIgnoreRowClickTarget(e.target)) return;
        onRowClick?.(row.original, e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          if (shouldIgnoreRowClickTarget(e.target)) return;
          onRowClick?.(row.original);
        }
      }}
      className={cn(
        "hover:bg-accent",
        !!onRowClick ? "cursor-pointer" : "cursor-default",
        selectedRowId && selectedRowId === row.id
          ? "bg-accent dark:bg-accent"
          : undefined,
        (rowIsSelected || shouldHighlightAllRows) && "bg-accent dark:bg-accent",
        getRowClassName?.(row.original),
      )}
    >
      {children}
    </TableRow>
  );
}

/** Each side of the 6px strip centered on the row's bottom border. */
const ROW_RESIZE_HALF_PX = 3;
const ROW_BORDER_PX = 1;

type RowResizeEdge = "above" | "below" | "last";

function rowResizeHandleStyle(edge: RowResizeEdge): CSSProperties {
  if (edge === "below") return { top: 0, height: ROW_RESIZE_HALF_PX };
  if (edge === "last") {
    return { bottom: -ROW_RESIZE_HALF_PX, height: ROW_RESIZE_HALF_PX * 2 };
  }
  // Ends on the outer edge of the 1px border, so 3px sits above that line.
  return { bottom: -ROW_BORDER_PX, height: ROW_RESIZE_HALF_PX };
}

function rowHeightFrameProps({
  rowheighttw,
  rowHeightPx,
  compact,
  topAlignCells,
  measure,
  clipContent = false,
}: {
  rowheighttw?: string;
  rowHeightPx?: number;
  compact: boolean;
  topAlignCells: boolean;
  measure: boolean;
  clipContent?: boolean;
}): {
  className: string;
  style?: CSSProperties;
  "data-row-height"?: string;
} {
  const isSmallRowHeight = compact;
  return {
    className: cn(
      "flex",
      isSmallRowHeight && !topAlignCells ? "items-center" : "items-start",
      !isSmallRowHeight && "py-1",
      rowHeightPx == null ? rowheighttw : "min-h-0 overflow-hidden",
      clipContent && "w-full min-w-0 overflow-hidden",
    ),
    style:
      rowHeightPx != null
        ? { height: rowHeightPx, maxHeight: rowHeightPx }
        : undefined,
    ...(measure ? { "data-row-height": "" } : {}),
  };
}

function TableBodyComponent<TData>({
  table,
  rowheighttw,
  rowHeight,
  rowHeightPx,
  customRowHeights,
  rowResizeEnabled = false,
  onCommitRowHeight,
  columns,
  data,
  help,
  noResultsMessage,
  onRowClick,
  renderRow,
  getRowClassName,
  highlightAllRows,
  selectionStore,
  topAlignCells = false,
  cellPadding = "compact",
  tableSnapshot: _tableSnapshot,
}: TableBodyComponentProps<TData>) {
  const visibleColumns = table.getVisibleLeafColumns();
  const rowModelRows = table.getRowModel().rows;
  const tableState = table.getState();
  const skeletonRowCount = Math.max(
    1,
    Math.min(tableState.pagination?.pageSize ?? 8, 8),
  );
  const dragRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);
  const [previewPx, setPreviewPx] = useState<number | null>(null);
  const rendering = resolveRowHeightRendering(
    {
      preset: rowHeight ?? "s",
      customPx: rowHeightPx ?? null,
      previewPx,
    },
    customRowHeights,
  );
  const previewCommitRef = useRef<number | null>(null);
  const keyGestureStartRef = useRef<number | null>(null);
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const [measuredPx, setMeasuredPx] = useState<number | undefined>(undefined);
  const effectiveRowHeightPx = previewPx ?? rowHeightPx;

  useLayoutEffect(() => {
    if (!rowResizeEnabled) return;
    const sized =
      tableBodyRef.current?.querySelector<HTMLElement>("[data-row-height]");
    const height = sized?.getBoundingClientRect().height;
    if (height == null || height <= 0) return;
    const rounded = Math.round(height);
    setMeasuredPx((current) => (current === rounded ? current : rounded));
  }, [rowResizeEnabled, rowHeight, rowModelRows.length, data.isLoading]);

  const onResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // button is 0 for a primary press. Some pointers report -1 until the
    // button is known; only an explicit non-primary button should bail.
    if (event.button > 0) return;
    event.preventDefault();
    event.stopPropagation();
    const sized = event.currentTarget
      .closest("td")
      ?.querySelector<HTMLElement>("[data-row-height]");
    const startHeight = sized?.getBoundingClientRect().height;
    if (startHeight == null || startHeight <= 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail when the pointer id is unknown. Moves fired on
      // the handle still update the height.
    }
  };

  const onResizePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    setPreviewPx(
      clampCustomRowHeightPx(drag.startHeight + (event.clientY - drag.startY)),
    );
  };

  const finishResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    const next = clampCustomRowHeightPx(
      drag.startHeight + (event.clientY - drag.startY),
    );
    setPreviewPx(null);
    if (next !== Math.round(drag.startHeight)) {
      onCommitRowHeight?.(next);
    }
  };

  const commitKeyboardResize = () => {
    const next = previewCommitRef.current;
    const start = keyGestureStartRef.current;
    if (next == null && start == null) return;
    previewCommitRef.current = null;
    keyGestureStartRef.current = null;
    setPreviewPx(null);
    if (next != null && start != null && next !== Math.round(start)) {
      onCommitRowHeight?.(next);
    }
  };

  const onResizeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    const sized = event.currentTarget
      .closest("td")
      ?.querySelector<HTMLElement>("[data-row-height]");
    const fallback =
      effectiveRowHeightPx ??
      measuredPx ??
      sized?.getBoundingClientRect().height ??
      MIN_CUSTOM_ROW_HEIGHT_PX;
    const current = previewCommitRef.current ?? fallback;
    if (keyGestureStartRef.current == null) {
      keyGestureStartRef.current = current;
    }
    const delta = event.key === "ArrowDown" ? 16 : -16;
    const next = clampCustomRowHeightPx(current + delta);
    previewCommitRef.current = next;
    setPreviewPx(next);
  };

  return (
    <RowHeightRenderingProvider
      compact={rendering.compact}
      expandedRead={rendering.expandedRead}
    >
      <TableBody ref={tableBodyRef}>
        {data.isLoading || !data.data ? (
          Array.from({ length: skeletonRowCount }).map((_, rowIndex) => (
            <TableRow key={`loading-row-${rowIndex}`} aria-hidden="true">
              {visibleColumns.map((column, columnIndex) => {
                const columnDef = column.columnDef as LangfuseColumnDef<TData>;

                return (
                  <TableCell
                    key={`${column.id}-loading-cell-${rowIndex}`}
                    className={cn(
                      "overflow-hidden border-b text-xs first:pl-2",
                      getCellPaddingClassName(
                        columnDef.cellPadding ?? cellPadding,
                      ),
                      rendering.compact && "whitespace-nowrap",
                      getPinningClasses(column),
                      getCellBackgroundClassName(columnDef.cellBackground),
                      columnDef.cellClassName,
                      columnDef.hideBelowMd && "hidden md:table-cell",
                    )}
                    style={{
                      ...getCommonPinningStyles(column),
                      width: columnDef.isFlexWidth
                        ? "auto"
                        : `calc(var(--col-${column.id}-size) * 1px)`,
                    }}
                  >
                    <div
                      {...rowHeightFrameProps({
                        rowheighttw,
                        rowHeightPx: effectiveRowHeightPx,
                        compact: rendering.compact,
                        topAlignCells,
                        measure: false,
                      })}
                    >
                      {(() => {
                        const loadingCell = columnDef.loadingCell;

                        if (typeof loadingCell === "function") {
                          return loadingCell();
                        }

                        if (loadingCell !== undefined) {
                          return loadingCell;
                        }

                        return (
                          <Skeleton
                            className={cn(
                              "h-4 w-1/2",
                              "min-w-[3rem]",
                              (rowIndex + columnIndex) % 4 === 0 && "w-3/4",
                              (rowIndex + columnIndex) % 4 === 1 && "w-1/2",
                              (rowIndex + columnIndex) % 4 === 2 && "w-2/3",
                              (rowIndex + columnIndex) % 4 === 3 && "w-5/6",
                            )}
                          />
                        );
                      })()}
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))
        ) : rowModelRows.length ? (
          rowModelRows.map((row) => {
            const cells = row.getVisibleCells().map((cell, cellIndex) => {
              const cellValue = cell.getValue();
              const isStringCell = typeof cellValue === "string";
              const isSmallRowHeight = rendering.compact;
              const columnDef = cell.column
                .columnDef as LangfuseColumnDef<TData>;
              const isLastRow = row.index === rowModelRows.length - 1;
              const isPrimaryHandle = row.index === 0 && cellIndex === 0;
              // 3px above this row's border, and 3px at the top of the next
              // row. The lower half lives in the next row so it can be grabbed
              // without covering the rest of that row. The last row has no
              // neighbor, so its strip hangs 3px below its own bottom edge.
              const resizeEdges: RowResizeEdge[] = [];
              if (rowResizeEnabled && row.index > 0) resizeEdges.push("below");
              if (rowResizeEnabled && isLastRow) resizeEdges.push("last");
              else if (rowResizeEnabled) resizeEdges.push("above");
              const primaryEdge: RowResizeEdge | null = isPrimaryHandle
                ? isLastRow
                  ? "last"
                  : "above"
                : null;

              return (
                <TableCell
                  key={cell.id}
                  className={cn(
                    "border-b text-xs first:pl-2",
                    rowResizeEnabled ? "overflow-visible" : "overflow-hidden",
                    rowResizeEnabled && "relative",
                    getCellPaddingClassName(
                      columnDef.cellPadding ?? cellPadding,
                    ),
                    isSmallRowHeight && "whitespace-nowrap",
                    getPinningClasses(cell.column),
                    getCellBackgroundClassName(columnDef.cellBackground),
                    columnDef.cellClassName,
                    columnDef.hideBelowMd && "hidden md:table-cell",
                  )}
                  style={{
                    ...getCommonPinningStyles(cell.column),
                    width: columnDef.isFlexWidth
                      ? "auto"
                      : `calc(var(--col-${cell.column.id}-size) * 1px)`,
                  }}
                >
                  <div
                    {...rowHeightFrameProps({
                      rowheighttw,
                      rowHeightPx: effectiveRowHeightPx,
                      compact: rendering.compact,
                      topAlignCells,
                      measure: rowResizeEnabled,
                      clipContent: rowResizeEnabled,
                    })}
                  >
                    {isStringCell && isSmallRowHeight ? (
                      <div
                        className="min-w-0 truncate leading-normal"
                        title={getPlainTextFromReactNode(
                          flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          ),
                        )}
                      >
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
                  {resizeEdges.map((edge) => {
                    const primary = edge === primaryEdge;
                    return (
                      <div
                        key={edge}
                        data-row-resize-handle=""
                        data-row-resize-edge={edge}
                        role={primary ? "slider" : undefined}
                        aria-orientation={primary ? "vertical" : undefined}
                        aria-label={primary ? "Row height" : undefined}
                        aria-valuemin={
                          primary ? MIN_CUSTOM_ROW_HEIGHT_PX : undefined
                        }
                        aria-valuemax={
                          primary ? MAX_CUSTOM_ROW_HEIGHT_PX : undefined
                        }
                        aria-valuenow={
                          primary
                            ? (effectiveRowHeightPx ?? measuredPx)
                            : undefined
                        }
                        aria-hidden={primary ? undefined : true}
                        tabIndex={primary ? 0 : undefined}
                        onPointerDown={onResizePointerDown}
                        onPointerMove={onResizePointerMove}
                        onPointerUp={finishResize}
                        onPointerCancel={finishResize}
                        onKeyDown={primary ? onResizeKeyDown : undefined}
                        onKeyUp={primary ? commitKeyboardResize : undefined}
                        onBlur={primary ? commitKeyboardResize : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        style={rowResizeHandleStyle(edge)}
                        className={cn(
                          // Invisible. The row-resize cursor is the pointer
                          // affordance; keyboard focus keeps a hairline ring.
                          "absolute inset-x-0 z-[1] cursor-row-resize touch-none bg-transparent select-none",
                          primary &&
                            "focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none focus-visible:ring-inset",
                        )}
                      />
                    );
                  })}
                </TableCell>
              );
            });

            return renderRow ? (
              <React.Fragment key={row.id}>
                {renderRow({ row, children: cells })}
              </React.Fragment>
            ) : (
              <TableRowComponent
                key={row.id}
                row={row}
                onRowClick={onRowClick}
                getRowClassName={getRowClassName}
                highlightAllRows={highlightAllRows}
                selectionStore={selectionStore}
              >
                {cells}
              </TableRowComponent>
            );
          })
        ) : (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={columns.length} className="h-24">
              <div className="text-muted-foreground pointer-events-none absolute left-[50%] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-center text-sm">
                {noResultsMessage ?? (
                  <>
                    No results.{" "}
                    {help && (
                      <DocPopup
                        description={help.description}
                        href={help.href}
                      />
                    )}
                  </>
                )}
              </div>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </RowHeightRenderingProvider>
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
  if (prev.rowHeightPx !== next.rowHeightPx) return false;
  if (prev.customRowHeights !== next.customRowHeights) return false;
  if (prev.rowResizeEnabled !== next.rowResizeEnabled) return false;
  if (prev.highlightAllRows !== next.highlightAllRows) return false;
  if (prev.selectionStore !== next.selectionStore) return false;
  if (prev.cellPadding !== next.cellPadding) return false;

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
