/* eslint-disable boundaries/dependencies */
import { type OrderByState } from "@langfuse/shared";
import {
  type ColumnDef,
  type ColumnOrderState,
  type OnChangeFn,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreVertical } from "lucide-react";
import { type ComponentProps, useMemo } from "react";

import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/utils/tailwind";

const INTERACTIVE_ROW_CLICK_SELECTOR =
  "a, button, input, select, textarea, summary, [role='button'], [role='link']";

function shouldIgnoreRowClickTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_ROW_CLICK_SELECTOR));
}

export type AsyncTableData<T> =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: T };

export interface TableProps<TData> {
  tableName: string;
  columns: ColumnDef<TData>[];
  actions?: (row: TData) => ComponentProps<typeof DropdownMenu>["items"];
  data: AsyncTableData<TData[]>;
  orderBy?: OrderByState;
  setOrderBy?: (state: OrderByState) => void;
  loadingRowCount?: number;
  noResultsMessage?: React.ReactNode;
  onRowClick?: (row: TData, event?: React.MouseEvent) => void;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  columnOrder?: ColumnOrderState;
  onColumnOrderChange?: OnChangeFn<ColumnOrderState>;
}

export function Table<TData extends object>({
  tableName,
  columns,
  actions,
  data,
  orderBy,
  setOrderBy,
  loadingRowCount = 8,
  noResultsMessage = "No results",
  onRowClick,
  columnVisibility,
  onColumnVisibilityChange,
  columnOrder,
  onColumnOrderChange,
}: TableProps<TData>) {
  const tableColumns = useMemo<ColumnDef<TData>[]>(() => {
    if (!actions) return columns;

    return [
      ...columns,
      {
        id: "__actions",
        header: "",
        size: 48,
        enableResizing: false,
        headerClassName: "text-right",
        cellClassName: "text-right",
        cell: ({ row }) => (
          <div
            className="ml-auto flex size-6 items-center justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenu items={actions(row.original)} placement="bottom-end">
              {({ getTriggerProps }) => (
                <IconButton
                  icon={MoreVertical}
                  label="Open actions menu"
                  size="sm"
                  variant="subtle"
                  {...getTriggerProps()}
                />
              )}
            </DropdownMenu>
          </div>
        ),
        loadingCell: (
          <div className="ml-auto flex h-4 w-6 items-center justify-center">
            <MoreVertical
              className="text-muted-foreground/30 size-4 animate-pulse"
              aria-hidden="true"
            />
          </div>
        ),
      },
    ];
  }, [actions, columns]);
  const table = useReactTable({
    data: data.status === "success" ? data.data : [],
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    state: { columnVisibility, columnOrder },
    onColumnVisibilityChange,
    onColumnOrderChange,
  });

  const visibleColumns = table.getVisibleLeafColumns();

  return (
    <div className="flex w-full max-w-full flex-1 flex-col overflow-auto">
      <div className="relative min-h-full w-full overflow-auto border-t [scrollbar-gutter:stable]">
        <table
          aria-label={tableName}
          className="w-full table-fixed border-separate border-spacing-0 space-y-4 overflow-auto text-sm"
        >
          <thead className="sticky top-0 z-20 [&_tr]:border-b">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b transition-colors">
                {headerGroup.headers.map((header) => {
                  const column = header.column.columnDef;
                  const isSortable = Boolean(
                    column.enableSorting && setOrderBy,
                  );
                  const isSorted = orderBy?.column === header.column.id;
                  const headerTitle =
                    typeof column.header === "string"
                      ? column.header
                      : undefined;
                  let ariaSort: React.AriaAttributes["aria-sort"];
                  if (isSortable) ariaSort = "none";
                  if (isSorted && orderBy.order === "ASC") {
                    ariaSort = "ascending";
                  }
                  if (isSorted && orderBy.order === "DESC") {
                    ariaSort = "descending";
                  }

                  return (
                    <th
                      key={header.id}
                      aria-sort={ariaSort}
                      className={cn(
                        "group bg-background text-muted-foreground relative h-10 border-b p-1 text-left align-middle font-bold first:pl-2",
                        column.headerClassName,
                        column.hideBelowMd && "hidden md:table-cell",
                      )}
                      style={{ width: header.getSize() }}
                    >
                      <div className="flex min-w-0 items-center select-none">
                        {!header.isPlaceholder && !isSortable && (
                          <span
                            className="truncate leading-normal"
                            title={headerTitle}
                          >
                            {flexRender(column.header, header.getContext())}
                          </span>
                        )}
                        {!header.isPlaceholder && isSortable && setOrderBy && (
                          <button
                            type="button"
                            aria-label={`Sort by ${headerTitle ?? header.column.id}`}
                            className="hover:text-foreground focus-visible:ring-ring group/sort flex min-w-0 cursor-pointer items-center rounded-sm outline-none focus-visible:ring-2"
                            onClick={() => {
                              if (!isSorted) {
                                setOrderBy({
                                  column: header.column.id,
                                  order: "DESC",
                                });
                                return;
                              }
                              if (orderBy.order === "DESC") {
                                setOrderBy({
                                  column: header.column.id,
                                  order: "ASC",
                                });
                                return;
                              }
                              setOrderBy(null);
                            }}
                          >
                            <span
                              className="truncate leading-normal"
                              title={headerTitle}
                            >
                              {flexRender(column.header, header.getContext())}
                            </span>
                            {!isSorted && (
                              <ArrowUpDown
                                className="ml-1.5 size-3 shrink-0 opacity-40 transition-opacity group-hover/sort:opacity-70"
                                aria-hidden="true"
                              />
                            )}
                            {isSorted && orderBy.order === "ASC" && (
                              <ArrowUp
                                className="ml-1.5 size-3 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            {isSorted && orderBy.order === "DESC" && (
                              <ArrowDown
                                className="ml-1.5 size-3 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        )}
                      </div>
                      {header.column.getCanResize() && (
                        <button
                          type="button"
                          aria-label={`Resize ${headerTitle ?? header.column.id} column`}
                          tabIndex={-1}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            header.column.resetSize();
                          }}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={cn(
                            "bg-secondary absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none opacity-0 select-none group-hover:opacity-100",
                            header.column.getIsResizing() &&
                              "bg-primary-accent opacity-100",
                          )}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="text-xs [&_tr:last-child_td]:border-b-0">
            {data.status === "loading" &&
              Array.from({ length: loadingRowCount }).map((_, rowIndex) => (
                <tr
                  key={`loading-row-${rowIndex}`}
                  className="h-12"
                  aria-hidden="true"
                >
                  {visibleColumns.map((column, columnIndex) => {
                    const loadingCell = column.columnDef.loadingCell;
                    return (
                      <td
                        key={column.id}
                        className={cn(
                          "h-full overflow-hidden border-b p-2 align-middle text-xs whitespace-nowrap first:pl-2",
                          column.columnDef.cellClassName,
                          column.columnDef.hideBelowMd &&
                            "hidden md:table-cell",
                        )}
                      >
                        <div className="flex min-w-0 items-center overflow-hidden">
                          {typeof loadingCell === "function" && loadingCell()}
                          {typeof loadingCell !== "function" && loadingCell}
                          {loadingCell === undefined && (
                            <Skeleton
                              className={cn(
                                "h-4 min-w-12",
                                (rowIndex + columnIndex) % 4 === 0 && "w-3/4",
                                (rowIndex + columnIndex) % 4 === 1 && "w-1/2",
                                (rowIndex + columnIndex) % 4 === 2 && "w-2/3",
                                (rowIndex + columnIndex) % 4 === 3 && "w-5/6",
                              )}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            {data.status === "error" && (
              <tr className="hover:bg-transparent">
                <td
                  colSpan={visibleColumns.length}
                  className="text-destructive h-24 border-b p-2 text-center align-middle"
                >
                  {data.error}
                </td>
              </tr>
            )}
            {data.status === "success" &&
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    "hover:bg-accent h-12 transition-colors",
                    onRowClick ? "cursor-pointer" : "cursor-default",
                  )}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={(event) => {
                    if (shouldIgnoreRowClickTarget(event.target)) return;
                    onRowClick?.(row.original, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    if (shouldIgnoreRowClickTarget(event.target)) return;
                    onRowClick?.(row.original);
                  }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const column = cell.column.columnDef;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "h-full overflow-hidden border-b p-2 align-middle text-xs whitespace-nowrap first:pl-2",
                          column.cellClassName,
                          column.hideBelowMd && "hidden md:table-cell",
                        )}
                      >
                        <div className="flex min-w-0 items-center overflow-hidden">
                          {flexRender(column.cell, cell.getContext())}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            {data.status === "success" &&
              table.getRowModel().rows.length === 0 && (
                <tr className="hover:bg-transparent">
                  <td
                    colSpan={visibleColumns.length}
                    className="text-muted-foreground h-24 border-b p-2 text-center align-middle"
                  >
                    {noResultsMessage}
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
