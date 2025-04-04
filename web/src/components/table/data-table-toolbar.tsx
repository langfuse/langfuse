import { Button } from "@/src/components/ui/button";
import React, { type Dispatch, type SetStateAction, useState } from "react";
import { Input } from "@/src/components/ui/input";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/data-table-column-visibility-filter";
import { type TracingSearchType, type FilterState } from "@langfuse/shared";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { type ColumnDefinition } from "@langfuse/shared";
import {
  type RowSelectionState,
  type ColumnOrderState,
  type VisibilityState,
} from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  DataTableRowHeightSwitch,
  type RowHeight,
} from "@/src/components/table/data-table-row-height-switch";
import { Search } from "lucide-react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { TableDateRangeDropdown } from "@/src/components/date-range-dropdowns";
import {
  type TableDateRange,
  type TableDateRangeOptions,
} from "@/src/utils/date-range-utils";
import { DataTableSelectAllBanner } from "@/src/components/table/data-table-multi-select-actions/data-table-select-all-banner";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import { cn } from "@/src/utils/tailwind";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Label } from "@/src/components/ui/label";
import DocPopup from "@/src/components/layouts/doc-popup";
import { env } from "@/src/env.mjs";
import { compactNumberFormatter } from "@/src/utils/numbers";

export interface MultiSelect {
  selectAll: boolean;
  setSelectAll: Dispatch<SetStateAction<boolean>>;
  selectedRowIds: string[];
  setRowSelection: Dispatch<SetStateAction<RowSelectionState>>;
  pageSize: number;
  pageIndex: number;
  totalCount: number | null;
}

interface SearchConfig {
  placeholder: string;
  updateQuery(event: string): void;
  currentQuery?: string;
  countOfFilteredRecordsInDatabase?: number;
  searchType?: TracingSearchType[];
  setSearchType?: (searchType: TracingSearchType[]) => void;
}

interface DataTableToolbarProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  filterColumnDefinition?: ColumnDefinition[];
  searchConfig?: SearchConfig;
  actionButtons?: React.ReactNode;
  filterState?: FilterState;
  setFilterState?:
    | Dispatch<SetStateAction<FilterState>>
    | ((newState: FilterState) => void);
  columnVisibility?: VisibilityState;
  setColumnVisibility?: Dispatch<SetStateAction<VisibilityState>>;
  columnOrder?: ColumnOrderState;
  setColumnOrder?: Dispatch<SetStateAction<ColumnOrderState>>;
  rowHeight?: RowHeight;
  setRowHeight?: Dispatch<SetStateAction<RowHeight>>;
  columnsWithCustomSelect?: string[];
  selectedOption?: TableDateRangeOptions;
  setDateRangeAndOption?: (
    option: TableDateRangeOptions,
    date?: TableDateRange,
  ) => void;
  multiSelect?: MultiSelect;
  environmentFilter?: {
    values: string[];
    onValueChange: (values: string[]) => void;
    options: { value: string }[];
  };
  className?: string;
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
  columnOrder,
  setColumnOrder,
  rowHeight,
  setRowHeight,
  columnsWithCustomSelect,
  selectedOption,
  setDateRangeAndOption,
  multiSelect,
  environmentFilter,
  className,
}: DataTableToolbarProps<TData, TValue>) {
  const [searchString, setSearchString] = useState(
    searchConfig?.currentQuery ?? "",
  );
  const [searchType, setSearchType] = useState<TracingSearchType[]>(
    searchConfig?.searchType ?? ["id"],
  );

  const shouldShowFullTextSearchOption =
    searchConfig?.searchType && searchConfig?.setSearchType;

  const capture = usePostHogClientCapture();

  const fullTextSearchDisabled: boolean =
    searchConfig?.countOfFilteredRecordsInDatabase === undefined ||
    (typeof searchConfig?.countOfFilteredRecordsInDatabase === "number" &&
      searchConfig.countOfFilteredRecordsInDatabase >
        env.NEXT_PUBLIC_LANGFUSE_FULL_TEXT_SEARCH_MAX_QUERY_LENGTH);

  return (
    <div className={cn("grid h-fit w-full gap-0 px-2", className)}>
      <div className="my-2 flex flex-wrap items-center gap-2 @container">
        {searchConfig && (
          <div className="flex max-w-md items-center rounded-md border">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                capture("table:search_submit");
                searchConfig.updateQuery(searchString);
              }}
            >
              <Search className="h-4 w-4" />
            </Button>
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
              className="min-w-0 max-w-fit border-none px-0"
            />
            {shouldShowFullTextSearchOption &&
              searchConfig.searchType &&
              searchConfig.setSearchType && (
                <div className="flex items-center border-l px-2">
                  <div className="flex items-center space-x-1">
                    <Checkbox
                      id="fullTextSearch"
                      checked={searchType.includes("text")}
                      disabled={fullTextSearchDisabled}
                      onCheckedChange={(checked) => {
                        const newSearchType: TracingSearchType[] = ["id"];
                        if (checked) {
                          newSearchType.push("text" as const);
                        }
                        setSearchType(newSearchType);
                        searchConfig.setSearchType?.(newSearchType);
                      }}
                    />
                    <Label htmlFor="fullTextSearch" className="text-xs">
                      Full Text Search
                    </Label>
                    {fullTextSearchDisabled && (
                      <DocPopup
                        description={`Full text search can only be executed on max. ${compactNumberFormatter(
                          env.NEXT_PUBLIC_LANGFUSE_FULL_TEXT_SEARCH_MAX_QUERY_LENGTH,
                        )} records. Please apply more filters.`}
                      />
                    )}
                  </div>
                </div>
              )}
          </div>
        )}
        {selectedOption && setDateRangeAndOption && (
          <TableDateRangeDropdown
            selectedOption={selectedOption}
            setDateRangeAndOption={setDateRangeAndOption}
          />
        )}
        {!!filterColumnDefinition && !!filterState && !!setFilterState && (
          <PopoverFilterBuilder
            columns={filterColumnDefinition}
            filterState={filterState}
            onChange={setFilterState}
            columnsWithCustomSelect={columnsWithCustomSelect}
          />
        )}
        {environmentFilter && (
          <MultiSelect
            title="Environment"
            label="Env"
            values={environmentFilter.values}
            onValueChange={environmentFilter.onValueChange}
            options={environmentFilter.options}
            className="my-0 w-auto overflow-hidden"
          />
        )}

        <div className="flex flex-row flex-wrap gap-2 pr-0.5 @6xl:ml-auto">
          {!!columnVisibility && !!setColumnVisibility && (
            <DataTableColumnVisibilityFilter
              columns={columns}
              columnVisibility={columnVisibility}
              setColumnVisibility={setColumnVisibility}
              columnOrder={columnOrder}
              setColumnOrder={setColumnOrder}
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
      {multiSelect &&
        multiSelect.pageIndex === 0 &&
        multiSelect.selectedRowIds.length === multiSelect.pageSize && (
          <DataTableSelectAllBanner {...multiSelect} />
        )}
    </div>
  );
}
