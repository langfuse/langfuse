import { type ColumnDef } from "@tanstack/react-table";
import { X } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { type TableRowOptions } from "@/src/components/table/types";
import { DataTableSelectFilter } from "@/src/components/table/data-table-select-filter";
import { DataTableNumberFilter } from "@/src/components/table/data-table-number-filter";
import React, { useState } from "react";
import { Input } from "@/src/components/ui/input";
import { DataTableKeyValueFilter } from "@/src/components/table/data-table-key-value-filter";

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
    searchConfig?.currentQuery ?? "",
  );

  const renderFilter = (
    column: ColumnDef<TData, TValue>,
    columnOptions: TableRowOptions | undefined,
  ) => {
    if (
      !column ||
      !column.enableColumnFilter ||
      !columnOptions ||
      !column?.meta?.filter
    )
      return undefined;

    const filter = column.meta.filter;
    const label = column.meta?.label;
    const type = filter.type;

    if (type === "select") {
      return (
        <DataTableSelectFilter
          key={label}
          title={label}
          meta={filter}
          options={columnOptions}
        />
      );
    }

    if (type === "number-comparison") {
      return (
        <DataTableNumberFilter
          key={label}
          title={label}
          meta={filter}
          options={columnOptions}
        />
      );
    }

    if (type === "key-value") {
      return (
        <DataTableKeyValueFilter key={label} title={label} meta={filter} />
      );
    }

    return undefined;
  };

  return (
    <div className="my-2 flex max-w-full items-center justify-between overflow-x-auto">
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
                  o.columnId.toLowerCase() ===
                  column.meta?.label?.toLowerCase(),
              );
              return renderFilter(column, columnOptions);
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
