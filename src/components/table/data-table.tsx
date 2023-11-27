"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnFiltersState,
  getFilteredRowModel,
  type OnChangeFn,
  type PaginationState,
  type Row,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { useEffect, useState } from "react";
import { DataTablePagination } from "@/src/components/table/data-table-pagination";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: AsyncTableData<TData[]>;
  pagination?: {
    pageCount: number;
    onChange: OnChangeFn<PaginationState>;
    state: PaginationState;
  };
  onSelectionChange?: (selectedRows: Row<TData>[]) => void;
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
  onSelectionChange,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState({});

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
    state: {
      columnFilters,
      pagination: pagination?.state,
      rowSelection,
    },
    manualFiltering: true,
  });

  useEffect(() => {
    if (onSelectionChange) {
      const selectedRowsIndexes = Object.keys(rowSelection).map(Number);
      const rows = table.getRowModel().rows;
      const selectedRows = rows.filter((_, i) => {
        return selectedRowsIndexes.includes(i);
      });

      onSelectionChange(selectedRows);
    }
  }, [rowSelection]);

  useEffect(() => {
    setRowSelection({});
  }, [table.getRowModel().rows.length]);

  const noOfSelectedRows = table.getFilteredSelectedRowModel().rows.length;

  return (
    <>
      {noOfSelectedRows > 0 && (
        <div className="flex-1 text-sm text-muted-foreground">
          {noOfSelectedRows} of {table.getFilteredRowModel().rows.length} row(s)
          selected.
        </div>
      )}
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
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
                    );
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
                    No results.
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
