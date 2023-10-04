import { Button } from "@/src/components/ui/button";
import React, { type Dispatch, type SetStateAction, useState } from "react";
import { Input } from "@/src/components/ui/input";
import { type FilterState } from "@/src/features/filters/types";
import { FilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";

interface SearchConfig {
  placeholder: string;
  updateQuery(event: string): void;
  currentQuery?: string;
}

interface DataTableToolbarProps {
  filterColumnDefinition: ColumnDefinition[];
  searchConfig?: SearchConfig;
  actionButtons?: React.ReactNode;
  filterState: FilterState;
  setFilterState: Dispatch<SetStateAction<FilterState>>;
}

export function DataTableToolbar({
  filterColumnDefinition,
  searchConfig,
  actionButtons,
  filterState,
  setFilterState,
}: DataTableToolbarProps) {
  const [searchString, setSearchString] = useState(
    searchConfig?.currentQuery ?? "",
  );

  return (
    <div className="my-2 flex max-w-full items-center justify-between overflow-x-auto">
      <div className="flex flex-1 items-center space-x-2">
        {searchConfig ? (
          <div className="flex max-w-md items-center space-x-2">
            <Input
              autoFocus
              placeholder={searchConfig.placeholder}
              value={searchString}
              className="h-10 w-[200px] lg:w-[350px]"
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
        <FilterBuilder
          columns={filterColumnDefinition}
          filterState={filterState}
          onChange={setFilterState}
        />
        <div className="flex-1" />
        {actionButtons ? actionButtons : null}
      </div>
    </div>
  );
}
