import { Button } from "@/src/components/ui/button";
import React, { type Dispatch, type SetStateAction, useState } from "react";
import { Input } from "@/src/components/ui/input";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/data-table-column-visibility-filter";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import {
  type FilterState,
  type ColumnDefinition,
  type OrderByState,
  type TableViewPresetDomain,
  type TableViewPresetTableName,
  type TracingSearchType,
} from "@langfuse/shared";
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
import {
  type TableDateRangeOptions,
  type DashboardDateRange,
} from "@/src/utils/date-range-utils";
import { DataTableSelectAllBanner } from "@/src/components/table/data-table-multi-select-actions/data-table-select-all-banner";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import { cn } from "@/src/utils/tailwind";
import { TableViewPresetsDrawer } from "@/src/components/table/table-view-presets/components/data-table-view-presets-drawer";
import { TableDateRangeDropdown } from "@/src/components/date-range-dropdowns";

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
  metadataSearchFields: string[];
  updateQuery: (event: string) => void;
  currentQuery?: string;
  tableAllowsFullTextSearch?: boolean;
  setSearchType: ((newSearchType: TracingSearchType[]) => void) | undefined;
  searchType: TracingSearchType[] | undefined;
  customDropdownLabels?: {
    metadata: string;
    fullText: string;
  };
  hidePerformanceWarning?: boolean;
}

interface TableViewControllers {
  applyViewState: (viewData: TableViewPresetDomain) => void;
  selectedViewId: string | null;
  handleSetViewId: (viewId: string | null) => void;
}

interface TableViewConfig {
  tableName: TableViewPresetTableName;
  projectId: string;
  controllers: TableViewControllers;
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
    dateRange: DashboardDateRange,
  ) => void;
  multiSelect?: MultiSelect;
  environmentFilter?: {
    values: string[];
    onValueChange: (values: string[]) => void;
    options: { value: string }[];
  };
  orderByState?: OrderByState;
  viewConfig?: TableViewConfig;
  filterWithAI?: boolean;
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
  orderByState,
  viewConfig,
  filterWithAI = false,
}: DataTableToolbarProps<TData, TValue>) {
  const [searchString, setSearchString] = useState(
    searchConfig?.currentQuery ?? "",
  );

  const capture = usePostHogClientCapture();

  return (
    <div className={cn("grid h-fit w-full gap-0 px-2", className)}>
      <div className="my-2 flex flex-wrap items-center gap-2 @container">
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
        {!!filterColumnDefinition && !!filterState && !!setFilterState && (
          <PopoverFilterBuilder
            columns={filterColumnDefinition}
            filterState={filterState}
            onChange={setFilterState}
            columnsWithCustomSelect={columnsWithCustomSelect}
            filterWithAI={filterWithAI}
          />
        )}
        {searchConfig && (
          <div className="flex max-w-[40rem] flex-shrink-0 items-stretch md:min-w-[32rem]">
            <div className="flex h-8 flex-1 items-center rounded-md border border-input bg-background pl-2">
              <Button
                variant="ghost"
                size="icon"
                className="mr-1"
                onClick={() => {
                  capture("table:search_submit");
                  searchConfig.updateQuery(searchString);
                  // Set to full-text search
                  if (searchConfig.tableAllowsFullTextSearch) {
                    searchConfig.setSearchType?.(["id", "content"]);
                  }
                }}
              >
                <Search className="h-4 w-4" />
              </Button>
              <Input
                autoFocus
                placeholder="Search traces"
                value={searchString}
                onChange={(event) => setSearchString(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    capture("table:search_submit");
                    searchConfig.updateQuery(searchString);
                    // Set to full-text search
                    if (searchConfig.tableAllowsFullTextSearch) {
                      searchConfig.setSearchType?.(["id", "content"]);
                    }
                  }
                }}
                className="w-full border-none bg-transparent px-0 py-2 text-sm focus-visible:outline-none focus-visible:ring-0"
              />
            </div>
          </div>
        )}
        {selectedOption && setDateRangeAndOption && (
          <TableDateRangeDropdown
            selectedOption={selectedOption}
            setDateRangeAndOption={setDateRangeAndOption}
          />
        )}

        <div className="flex flex-row flex-wrap gap-2 pr-0.5 @6xl:ml-auto">
          {!!columnVisibility && !!columnOrder && !!viewConfig && (
            <TableViewPresetsDrawer
              viewConfig={viewConfig}
              currentState={{
                orderBy: orderByState ?? null,
                filters: filterState ?? [],
                columnOrder,
                columnVisibility,
                searchQuery: searchString,
              }}
            />
          )}
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
