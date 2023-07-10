import { type ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { type TableRowOptions } from "@/src/components/table/types";
import { DataTableSelectFilter } from "@/src/components/table/data-table-select-filter";
import { DataTableNumberFilter } from "@/src/components/table/data-table-number-filter";
import React from "react";

interface DataTableToolbarProps<TData, TValue> {
  columnDefs: ColumnDef<TData, TValue>[];
  options: TableRowOptions[];
  resetFilters: () => void;
  isFiltered: () => boolean;
}

export function DataTableToolbar<TData, TValue>({
  columnDefs,
  options,
  resetFilters,
  isFiltered,
}: DataTableToolbarProps<TData, TValue>) {
  return (
    <div className="my-2 flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        {columnDefs.map((column) => {
          const columnOptions = options.find(
            (o) =>
              o.columnId.toLowerCase() === column.meta?.label?.toLowerCase()
          );
          return column.enableColumnFilter && columnOptions ? (
            column.meta?.filter?.type === "select" ? (
              <DataTableSelectFilter
                title={column.meta?.label}
                meta={column.meta?.filter}
                options={columnOptions}
              />
            ) : column.meta?.filter?.type === "number-comparison" ? (
              <DataTableNumberFilter
                title={column.meta?.label}
                meta={column.meta?.filter}
                options={columnOptions}
              />
            ) : undefined
          ) : undefined;
        })}
        {isFiltered() && (
          <Button
            variant="ghost"
            onClick={() => resetFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
