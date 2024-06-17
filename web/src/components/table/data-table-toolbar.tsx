import { Button } from "@/src/components/ui/button";
import React, { type Dispatch, type SetStateAction, useState } from "react";
import { Input } from "@/src/components/ui/input";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/data-table-column-visibility-filter";
import { type FilterState } from "@langfuse/shared";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type ColumnDefinition } from "@langfuse/shared";
import { type VisibilityState } from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  DataTableRowHeightSwitch,
  type RowHeight,
} from "@/src/components/table/data-table-row-height-switch";
import { Search } from "lucide-react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

interface SearchConfig {
  placeholder: string;
  updateQuery(event: string): void;
  currentQuery?: string;
}

interface DataTableToolbarProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  filterColumnDefinition?: ColumnDefinition[];
  searchConfig?: SearchConfig;
  actionButtons?: React.ReactNode;
  filterState?: FilterState;
  setFilterState?: Dispatch<SetStateAction<FilterState>>;
  columnVisibility?: VisibilityState;
  setColumnVisibility?: Dispatch<SetStateAction<VisibilityState>>;
  rowHeight?: RowHeight;
  setRowHeight?: Dispatch<SetStateAction<RowHeight>>;
  columnsWithCustomSelect?: string[];
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
  rowHeight,
  setRowHeight,
  columnsWithCustomSelect,
}: DataTableToolbarProps<TData, TValue>) {
  const [searchString, setSearchString] = useState(
    searchConfig?.currentQuery ?? "",
  );
  const capture = usePostHogClientCapture();

  return (
    <div className="my-2 flex flex-wrap items-center gap-2 @container">
      {searchConfig && (
        <div className="flex max-w-md items-center">
          <Input
            autoFocus
            placeholder={searchConfig.placeholder}
            value={searchString}
            onChange={(event) => setSearchString(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                capture("table:search_submit");
                searchConfig.updateQuery(searchString);
              }
            }}
            className="h-10 w-[150px] rounded-r-none @6xl:w-[250px]"
          />
          <Button
            variant="outline"
            onClick={() => {
              capture("table:search_submit");
              searchConfig.updateQuery(searchString);
            }}
            className="rounded-l-none border-l-0 p-3"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      )}
      {!!filterColumnDefinition && !!filterState && !!setFilterState && (
        <PopoverFilterBuilder
          columns={filterColumnDefinition}
          filterState={filterState}
          onChange={setFilterState}
          columnsWithCustomSelect={columnsWithCustomSelect}
        />
      )}
      <div className="flex flex-row flex-wrap gap-2 pr-0.5 @6xl:ml-auto">
        {!!columnVisibility && !!setColumnVisibility && (
          <DataTableColumnVisibilityFilter
            columns={columns}
            columnVisibility={columnVisibility}
            setColumnVisibility={setColumnVisibility}
          />
        )}
        {!!rowHeight && !!setRowHeight && (
          <DataTableRowHeightSwitch
            rowHeight={rowHeight}
            setRowHeight={setRowHeight}
          />
        )}
        {actionButtons}
      </div>
    </div>
  );
}
