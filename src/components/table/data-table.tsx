"use client";

import DocPopup from "@/src/components/layouts/doc-popup";
import { DataTablePagination } from "@/src/components/table/data-table-pagination";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import ColumnResizeIndicator from "@/src/features/column-sizing/components/ColumnResizeIndicator";
import { type OrderByState } from "@/src/features/orderBy/types";
import { cn } from "@/src/utils/tailwind";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnFiltersState,
  type ColumnSizingState,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type VisibilityState,
  type HeaderGroup,
  type Header,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

interface DataTableProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  data: AsyncTableData<TData[]>;
  pagination?: {
    pageCount: number;
    onChange: OnChangeFn<PaginationState>;
    state: PaginationState;
  };
  rowSelection?: RowSelectionState;
  setRowSelection?: OnChangeFn<RowSelectionState>;
  columnSizing?: ColumnSizingState;
  onColumnSizingChange?: OnChangeFn<ColumnSizingState>;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  orderBy?: OrderByState;
  setOrderBy?: (s: OrderByState) => void;
  help?: { description: string; href: string };
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
  columnSizing,
  onColumnSizingChange,
  columnVisibility,
  onColumnVisibilityChange,
  help,
  orderBy,
  setOrderBy,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data: data.data ?? [],
    columns,
    columnResizeMode: "onChange",
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getCoreRowModel: getCoreRowModel(),
    manualPagination: pagination !== undefined,
    pageCount: pagination?.pageCount ?? 0,
    onPaginationChange: pagination?.onChange,
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange: onColumnSizingChange,
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
      columnSizing,
      columnVisibility,
      rowSelection,
    },
    manualFiltering: true,
  });
  const totalSize = table.getTotalSize();
  const headerGroups = useMemo(() => {
    return table.getHeaderGroups().map((headerGroup) => {
      console.log("Rerender header group");
      return {
        ...headerGroup,
        headers: headerGroup.headers.map((header) => {
          console.log(header.index, header.getSize());
          return {
            ...header,
          };
        }),
      };
    });
  }, [table, columnSizing, columnVisibility]);

  const isResizing = headerGroups.some((headerGroup) =>
    headerGroup.headers.some((header) => header.column.getIsResizing()),
  );
  // headerGroups.map((headerGroup) => console.log(headerGroup.headers));
  return (
    <>
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table style={{ width: totalSize, minWidth: "100%" }}>
            <TableHeader>
              {headerGroups.map((headerGroup: HeaderGroup<TData>) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header: Header<TData, unknown>) => {
                    const sortingEnabled =
                      header.column.columnDef.enableSorting;
                    const resizingEnabled = header.column.getCanResize();
                    return header.column.getIsVisible() ? (
                      <TableHead
                        key={header.id}
                        className={cn(
                          sortingEnabled ? "cursor-pointer" : null,
                          "relative whitespace-nowrap p-2",
                          resizingEnabled ? "border-r" : "w-0",
                        )}
                        style={{ width: header.getSize() }}
                        title={sortingEnabled ? "Sort by this column" : ""}
                        onPointerUp={() => {
                          if (
                            !setOrderBy ||
                            !header.column.columnDef.id ||
                            !sortingEnabled
                          ) {
                            return;
                          }

                          if (orderBy?.column === header.column.columnDef.id) {
                            if (orderBy.order === "DESC") {
                              setOrderBy({
                                column: header.column.columnDef.id,
                                order: "ASC",
                              });
                            } else {
                              setOrderBy(null);
                            }
                          } else {
                            setOrderBy({
                              column: header.column.columnDef.id,
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

                              {orderBy?.column === header.column.columnDef.id
                                ? renderOrderingIndicator(orderBy)
                                : null}
                            </div>
                          </>
                        )}

                        {header.column.getCanResize() ? (
                          <ColumnResizeIndicator header={header} />
                        ) : null}
                      </TableHead>
                    ) : null;
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {data.isLoading || !data.data ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
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
                        className="overflow-hidden whitespace-nowrap px-2 py-1 text-xs first:pl-2"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
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
      </div>
      {pagination !== undefined ? <DataTablePagination table={table} /> : null}
    </>
  );
}

function renderOrderingIndicator(orderBy?: OrderByState) {
  if (!orderBy) return;
  if (orderBy.order === "ASC") return <span className="ml-1">▲</span>;
  else return <span className="ml-1">▼</span>;
}
