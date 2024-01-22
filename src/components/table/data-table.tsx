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
import useColumnSizing from "@/src/features/column-sizing/hooks/useColumnSizing";
import { type OrderByState } from "@/src/features/orderBy/types";
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
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

interface DataTableProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  data: AsyncTableData<TData[]>;
  pagination?: {
    pageCount: number;
    onChange: OnChangeFn<PaginationState>;
    state: PaginationState;
  };
  resizingEnabled?: boolean;
  rowSelection?: RowSelectionState;
  setRowSelection?: OnChangeFn<RowSelectionState>;
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
  columnVisibility,
  onColumnVisibilityChange,
  help,
  orderBy,
  setOrderBy,
  resizingEnabled = false,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const router = useRouter();
  const parentComponent = router.route.split("/")[3] ?? "unknown";
  const storageKey = parentComponent + "ColumnSizing";
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

  const [columnSizing, setColumnSizing] = useColumnSizing(storageKey);

  const columnSizeVars = useMemo(() => {
    const headers = table.getFlatHeaders();
    const colSizes: { [key: string]: number } = {};
    for (let i = 0; i < headers.length; i++) {
      console.log("ColumnSizing Options", table.getState().columnSizingInfo);
      const header = headers[i]!;
      colSizes[`--header-${header.id}-size`] = header.getSize();
      colSizes[`--col-${header.column.id}-size`] = header.column.getSize();
      console.log("size", header.getSize());
    }
    return colSizes;
  }, [table.getState().columnSizingInfo]);

  const headerGroups = useMemo(() => {
    return table.getHeaderGroups().map((headerGroup) => {
      return {
        ...headerGroup,
        headers: headerGroup.headers.map((header) => {
          return {
            ...header,
            size: `calc(var(--header-${header.id}-size) * 1px)`,
          };
        }),
      };
    });
  }, [table]);
  console.log("ColumnSizing Options", table.getState().columnSizingInfo);

  useEffect(() => {
    const headers = table.getFlatHeaders();
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]!;
      const newSize = header.getSize();
      if (newSize !== columnSizing[header.column.id]) {
        setColumnSizing((prevSizing) => ({
          ...prevSizing,
          [header.column.id]: newSize,
        }));
      }
    }
  }, [table.getState().columnSizingInfo, columnSizing, setColumnSizing]);

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table
            style={{
              ...columnSizeVars,
              width: table.getTotalSize(),
              minWidth: "100%",
            }}
          >
            <TableHeader>
              {headerGroups.map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const sortingEnabled =
                      header.column.columnDef.enableSorting;
                    const columnResizable =
                      header.column.getCanResize() && resizingEnabled;
                    return header.column.getIsVisible() ? (
                      <TableHead
                        key={header.id}
                        className={cn(
                          sortingEnabled ? "cursor-pointer" : null,
                          "relative whitespace-nowrap p-2",
                          columnResizable ? "border-r" : "w-0",
                        )}
                        style={{ width: header.size }}
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

                        {header.column.getCanResize() && resizingEnabled ? (
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
