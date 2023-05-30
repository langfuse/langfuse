import { type ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";
import { type RowOptions } from "@/src/pages/project/[projectId]/traces";

interface DataTableToolbarProps<TData, TValue> {
  columnDefs: ColumnDef<TData, TValue>[];
  options: RowOptions[];
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
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        {columnDefs.map((column) => {
          const columnOptions = options.find(
            (o) =>
              o.columnId.toLowerCase() === column.meta?.label?.toLowerCase()
          );
          return column.enableColumnFilter && columnOptions ? (
            <DataTableFacetedFilter
              columnDef={column}
              title={column.meta?.label}
              options={columnOptions}
            />
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
