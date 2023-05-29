"use client";

import { type Table } from "@tanstack/react-table";
import { X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { DataTableFacetedFilter } from "./data-table-faceted-filter";
import { type TraceFilterInput, type TraceRowOptions } from "../pages/traces";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  options: TraceRowOptions;
  queryOptions: TraceFilterInput;
  updateQueryOptions: (options: TraceFilterInput) => void;
}

export function DataTableToolbar<TData>({
  table,
  options,
  queryOptions,
  updateQueryOptions,
}: DataTableToolbarProps<TData>) {
  const isFiltered = queryOptions.names !== null;

  console.log("hello");

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        {table.getColumn("id") && (
          <DataTableFacetedFilter
            column={table.getColumn("id")}
            title="ID"
            options={options.id}
            queryOptions={queryOptions}
            updateQueryOptions={updateQueryOptions}
          />
        )}
        {/* {table.getColumn("name") && (
          <DataTableFacetedFilter
            column={table.getColumn("name")}
            title="Name"
            options={options.name}
            updateQueryOptions={updateName}
          />
        )}
        {table.getColumn("status") && (
          <DataTableFacetedFilter
            column={table.getColumn("status")}
            title="Status"
            options={options.status}

          />
        )} */}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
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
