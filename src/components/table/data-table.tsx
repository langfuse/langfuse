"use client";

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnFiltersState,
  getFilteredRowModel,
  type OnChangeFn,
  type PaginationState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { useState } from "react";
import { DataTablePagination } from "@/src/components/table/data-table-pagination";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import DocPopup from "@/src/components/layouts/doc-popup";

interface DataTableProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  data: AsyncTableData<TData[]>;
  pagination?: {
    pageCount: number;
    onChange: OnChangeFn<PaginationState>;
    state: PaginationState;
  };
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: OnChangeFn<VisibilityState>;
  help?: { description: string; href: string };
}

export interface AsyncTableData<T> {
  isLoading: boolean;
  isError: boolean;
  data?: T;
  error?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pagination,
  columnVisibility,
  onColumnVisibilityChange,
  help,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const table = useReactTable({
    data: data.data ?? [],
    columns,
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getCoreRowModel: getCoreRowModel(),
    manualPagination: pagination !== undefined,
    pageCount: pagination?.pageCount ?? 0,
    onPaginationChange: pagination?.onChange,
    onColumnVisibilityChange: onColumnVisibilityChange,
    state: {
      columnFilters,
      pagination: pagination?.state,
      columnVisibility,
    },
    manualFiltering: true,
  });

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return header.column.getIsVisible() ? (
                      <TableHead
                        key={header.id}
                        className="whitespace-nowrap p-2"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
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
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className="overflow-hidden whitespace-nowrap p-2 text-xs"
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
