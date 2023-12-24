import { Button } from "@/src/components/ui/button";
import React, { type Dispatch, type SetStateAction, useState } from "react";
import { Input } from "@/src/components/ui/input";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/data-table-column-visibility-filter";
import { type FilterState } from "@/src/features/filters/types";
import { FilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";
import { type VisibilityState } from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";

interface SearchConfig {
  placeholder: string;
  updateQuery(event: string): void;
  currentQuery?: string;
}

interface DataTableToolbarProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  filterColumnDefinition: ColumnDefinition[];
  searchConfig?: SearchConfig;
  actionButtons?: React.ReactNode;
  filterState: FilterState;
  setFilterState: Dispatch<SetStateAction<FilterState>>;
  columnVisibility?: VisibilityState;
  setColumnVisibility?: Dispatch<SetStateAction<VisibilityState>>;
}

export function DataTableToolbar<TData, TValue>({
  columns,
  filterColumnDefinition,
  searchConfig,
  actionButtons,
  filterState,
  setFilterState,
  columnVisibility,
  setColumnVisibility,
}: DataTableToolbarProps<TData, TValue>) {
  const [searchString, setSearchString] = useState(
    searchConfig?.currentQuery ?? "",
  );

  return (
    <div className="my-2 flex max-w-full items-center justify-between overflow-x-auto">
      <div className="flex flex-1 items-center space-x-2">
        {searchConfig && (
          <div className="flex max-w-md items-center space-x-2">
            <Input
              autoFocus
              placeholder={searchConfig.placeholder}
              value={searchString}
              onChange={(event) => setSearchString(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  searchConfig.updateQuery(searchString);
                }
              }}
              className="h-10 w-[200px] lg:w-[350px]"
            />
            <Button
              variant="outline"
              onClick={() => searchConfig.updateQuery(searchString)}
            >
              Search
            </Button>
          </div>
        )}
        <FilterBuilder
          columns={filterColumnDefinition}
          filterState={filterState}
          onChange={setFilterState}
        />
        <div className="flex-1" />
        {!!columnVisibility && !!setColumnVisibility && (
          <DataTableColumnVisibilityFilter
            columns={columns}
            columnVisibility={columnVisibility}
            setColumnVisibility={setColumnVisibility}
          />
        )}
        {actionButtons}
      </div>
    </div>
  );
}
