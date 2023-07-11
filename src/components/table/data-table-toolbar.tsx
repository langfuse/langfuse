import { type ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { type TableRowOptions } from "@/src/components/table/types";
import { DataTableSelectFilter } from "@/src/components/table/data-table-select-filter";
import { DataTableNumberFilter } from "@/src/components/table/data-table-number-filter";
import React, { useState } from "react";
import { Input } from "@/src/components/ui/input";
import { Separator } from "@radix-ui/react-separator";

interface SearchConfig {
  placeholder: string;
  updateQuery(event: string): void;
  currentQuery?: string;
}

interface DataTableToolbarProps<TData, TValue> {
  columnDefs: ColumnDef<TData, TValue>[];
  options: TableRowOptions[];
  searchConfig?: SearchConfig;
  resetFilters: () => void;
  isFiltered: () => boolean;
}

export function DataTableToolbar<TData, TValue>({
  columnDefs,
  options,
  searchConfig,
  resetFilters,
  isFiltered,
}: DataTableToolbarProps<TData, TValue>) {
  const [searchString, setSearchString] = useState(
    searchConfig?.currentQuery ?? ""
  );

  return (
    <div className="my-2 flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        {searchConfig ? (
          <div className="flex w-full max-w-md items-center space-x-2">
            <Input
              autoFocus
              placeholder={searchConfig.placeholder}
              value={searchString}
              className="h-8 w-[350px]"
              onChange={(event) => {
                setSearchString(event.currentTarget.value);
              }}
            />
            <Button
              variant="outline"
              type="submit"
              onClick={() => searchConfig.updateQuery(searchString)}
            >
              Search
            </Button>
          </div>
        ) : undefined}
        {options
          ? columnDefs.map((column) => {
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
            })
          : undefined}
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
