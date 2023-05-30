import { type ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";
import { type TraceFilterInput, type TraceRowOptions } from "../pages/traces";

interface DataTableToolbarProps<TData, TValue> {
  columnDefs: ColumnDef<TData, TValue>[];
  options: TraceRowOptions[];
  queryOptions: TraceFilterInput;
  updateQueryOptions: (options: TraceFilterInput) => void;
}

export function DataTableToolbar<TData, TValue>({
  columnDefs,
  options,
  queryOptions,
  updateQueryOptions,
}: DataTableToolbarProps<TData, TValue>) {
  const isFiltered =
    queryOptions.name !== null ||
    queryOptions.id !== null ||
    queryOptions.status !== null;

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
              queryOptions={queryOptions}
              options={columnOptions}
            />
          ) : undefined;
        })}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() =>
              updateQueryOptions({
                attribute: {},
                name: null,
                id: null,
                status: null,
              })
            }
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
