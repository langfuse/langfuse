import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { DatePicker } from "@/src/components/date-picker";
import { useState, type Dispatch, type SetStateAction } from "react";
import { Filter, Plus, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import {
  type WipFilterState,
  type WipFilterCondition,
  type FilterState,
  type FilterCondition,
  type ColumnDefinition,
  filterOperators,
  singleFilter,
} from "@langfuse/shared";
import { NonEmptyString } from "@langfuse/shared";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

// Has WipFilterState, passes all valid filters to parent onChange
export function PopoverFilterBuilder({
  columns,
  filterState,
  onChange,
  columnsWithCustomSelect = [],
}: {
  columns: ColumnDefinition[];
  filterState: FilterState;
  onChange: Dispatch<SetStateAction<FilterState>>;
  columnsWithCustomSelect?: string[];
}) {
  const capture = usePostHogClientCapture();
  const [wipFilterState, _setWipFilterState] =
    useState<WipFilterState>(filterState);
  const addNewFilter = () => {
    setWipFilterState((prev) => [
      ...prev,
      {
        column: undefined,
        type: undefined,
        operator: undefined,
        value: undefined,
        key: undefined,
      },
    ]);
  };

  const getValidFilters = (state: WipFilterState): FilterCondition[] => {
    const valid = state.filter(
      (f) => singleFilter.safeParse(f).success,
    ) as FilterCondition[];
    return valid;
  };

  const setWipFilterState = (
    state: ((prev: WipFilterState) => WipFilterState) | WipFilterState,
  ) => {
    _setWipFilterState((prev) => {
      const newState = state instanceof Function ? state(prev) : state;
      const validFilters = getValidFilters(newState);
      onChange(validFilters);
      return newState;
    });
  };

  return (
    <div className="flex items-center">
      <Popover
        onOpenChange={(open) => {
          if (open) {
            capture("table:filter_builder_open");
          }
          // Create empty filter when opening popover
          if (open && filterState.length === 0) addNewFilter();
          // Discard all wip filters when closing popover
          if (!open) {
            capture("table:filter_builder_close", {
              filter: filterState,
            });
            setWipFilterState(filterState);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline">
            <Filter className="h-4 w-4" />
            <span className="hidden @6xl:ml-2 @6xl:inline">Filter</span>
            {filterState.length > 0 && filterState.length < 3 ? (
              <InlineFilterState filterState={filterState} />
            ) : null}
            {filterState.length > 0 && (
              <span
                className={cn(
                  "ml-3 rounded-md bg-input px-2 py-1 text-xs @6xl:hidden",
                  filterState.length > 2 && "@6xl:inline",
                )}
              >
                {filterState.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-fit max-w-[90vw] overflow-x-auto"
          align="start"
        >
          <FilterBuilderForm
            columns={columns}
            filterState={wipFilterState}
            onChange={setWipFilterState}
            columnsWithCustomSelect={columnsWithCustomSelect}
          />
        </PopoverContent>
      </Popover>
      {filterState.length > 0 ? (
        <Button
          onClick={() => setWipFilterState([])}
          variant="ghost"
          size="icon"
          className="ml-2"
        >
          <X className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}

export function InlineFilterState({
  filterState,
}: {
  filterState: FilterState;
}) {
  return filterState.map((filter, i) => {
    return (
      <span
        key={i}
        className="ml-2 hidden whitespace-nowrap rounded-md bg-input px-2 py-1 text-xs @6xl:block"
      >
        {filter.column}
        {filter.type === "stringObject" || filter.type === "numberObject"
          ? `.${filter.key}`
          : ""}{" "}
        {filter.operator}{" "}
        {filter.type === "datetime"
          ? new Date(filter.value).toLocaleDateString()
          : filter.type === "stringOptions" || filter.type === "arrayOptions"
            ? filter.value.length > 2
              ? `${filter.value.length} selected`
              : filter.value.join(", ")
            : filter.type === "number" || filter.type === "numberObject"
              ? filter.value
              : filter.type === "boolean"
                ? `${filter.value}`
                : `"${filter.value}"`}
      </span>
    );
  });
}

export function InlineFilterBuilder({
  columns,
  filterState,
  onChange,
  disabled,
}: {
  columns: ColumnDefinition[];
  filterState: FilterState;
  onChange: Dispatch<SetStateAction<FilterState>>;
  disabled?: boolean;
}) {
  const [wipFilterState, _setWipFilterState] =
    useState<WipFilterState>(filterState);

  const setWipFilterState = (
    state: ((prev: WipFilterState) => WipFilterState) | WipFilterState,
  ) => {
    _setWipFilterState((prev) => {
      const newState = state instanceof Function ? state(prev) : state;
      const validFilters = newState.filter(
        (f) => singleFilter.safeParse(f).success,
      ) as FilterState;
      onChange(validFilters);
      return newState;
    });
  };

  return (
    <div className="flex flex-col">
      <FilterBuilderForm
        columns={columns}
        filterState={wipFilterState}
        onChange={setWipFilterState}
        disabled={disabled}
      />
    </div>
  );
}

function FilterBuilderForm({
  columns,
  filterState,
  onChange,
  disabled,
  columnsWithCustomSelect = [],
}: {
  columns: ColumnDefinition[];
  filterState: WipFilterState;
  onChange: Dispatch<SetStateAction<WipFilterState>>;
  disabled?: boolean;
  columnsWithCustomSelect?: string[];
}) {
  const handleFilterChange = (filter: WipFilterCondition, i: number) => {
    onChange((prev) => {
      const newState = [...prev];
      newState[i] = filter;
      return newState;
    });
  };

  const addNewFilter = () => {
    onChange((prev) => [
      ...prev,
      {
        column: undefined,
        operator: undefined,
        value: undefined,
        type: undefined,
        key: undefined,
      },
    ]);
  };

  const removeFilter = (i: number) => {
    onChange((prev) => {
      const newState = [...prev];
      newState.splice(i, 1);
      return newState;
    });
  };

  return (
    <>
      <table className="table-auto">
        <tbody>
          {filterState.map((filter, i) => {
            const column = columns.find(
              (c) => c.id === filter.column || c.name === filter.column,
            );
            return (
              <tr key={i}>
                <td className="p-1 text-sm">{i === 0 ? "Where" : "And"}</td>
                <td className="flex gap-2 p-1">
                  {/* selector of the column to be filtered */}
                  <Select
                    value={column ? column.id : ""}
                    disabled={disabled}
                    onValueChange={(value) => {
                      handleFilterChange(
                        {
                          column: columns.find((c) => c.id === value)?.name,
                          type: columns.find((c) => c.id === value)?.type,
                          operator: undefined,
                          value: undefined,
                          key: undefined,
                        },
                        i,
                      );
                    }}
                  >
                    <SelectTrigger className="min-w-[100px]">
                      <SelectValue placeholder="Column" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filter.type &&
                  (filter.type === "numberObject" ||
                    filter.type === "stringObject") &&
                  (column?.type === "numberObject" ||
                    column?.type === "stringObject") ? (
                    column.keyOptions ? (
                      // selector of the key of the object to be filtered
                      <Select
                        disabled={!filter.column}
                        onValueChange={(value) => {
                          handleFilterChange({ ...filter, key: value }, i);
                        }}
                        value={filter.key ?? ""}
                      >
                        <SelectTrigger className="min-w-[60px]">
                          <SelectValue placeholder="" />
                        </SelectTrigger>
                        <SelectContent>
                          {column.keyOptions
                            .filter((o) => NonEmptyString.safeParse(o).success)
                            .map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        value={filter.key ?? ""}
                        placeholder="key"
                        disabled={disabled}
                        onChange={(e) =>
                          handleFilterChange(
                            { ...filter, key: e.target.value },
                            i,
                          )
                        }
                      />
                    )
                  ) : null}
                </td>
                <td className="p-1">
                  <Select
                    disabled={!filter.column || disabled}
                    onValueChange={(value) => {
                      handleFilterChange(
                        {
                          ...filter,
                          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
                          operator: value as any,
                        },
                        i,
                      );
                    }}
                    value={filter.operator ?? ""}
                  >
                    <SelectTrigger className="min-w-[60px]">
                      <SelectValue placeholder="" />
                    </SelectTrigger>
                    <SelectContent>
                      {filter.type !== undefined
                        ? filterOperators[filter.type].map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))
                        : null}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-1">
                  {filter.type === "string" ||
                  filter.type === "stringObject" ? (
                    <Input
                      disabled={disabled}
                      value={filter.value ?? ""}
                      placeholder="string"
                      onChange={(e) =>
                        handleFilterChange(
                          { ...filter, value: e.target.value },
                          i,
                        )
                      }
                    />
                  ) : filter.type === "number" ||
                    filter.type === "numberObject" ? (
                    <Input
                      value={filter.value ?? undefined}
                      disabled={disabled}
                      type="number"
                      step="0.01"
                      lang="en-US"
                      onChange={(e) =>
                        handleFilterChange(
                          {
                            ...filter,
                            value: isNaN(Number(e.target.value))
                              ? e.target.value
                              : Number(e.target.value),
                          },
                          i,
                        )
                      }
                    />
                  ) : filter.type === "datetime" ? (
                    <DatePicker
                      className="min-w-[100px]"
                      disabled={disabled}
                      date={filter.value ? new Date(filter.value) : undefined}
                      onChange={(date) => {
                        handleFilterChange(
                          {
                            ...filter,
                            value: date,
                          },
                          i,
                        );
                      }}
                    />
                  ) : filter.type === "stringOptions" ||
                    filter.type === "arrayOptions" ? (
                    <MultiSelect
                      title="Value"
                      className="min-w-[100px]"
                      options={
                        column?.type === filter.type ? column.options : []
                      }
                      onValueChange={(value) =>
                        handleFilterChange({ ...filter, value }, i)
                      }
                      values={Array.isArray(filter.value) ? filter.value : []}
                      disabled={disabled}
                      isCustomSelectEnabled={
                        column?.type === filter.type &&
                        columnsWithCustomSelect.includes(column.id)
                      }
                    />
                  ) : filter.type === "boolean" ? (
                    <Select
                      disabled={disabled}
                      onValueChange={(value) => {
                        handleFilterChange(
                          {
                            ...filter,
                            value: value !== "" ? value === "true" : undefined,
                          },
                          i,
                        );
                      }}
                      value={filter.value?.toString() ?? ""}
                    >
                      <SelectTrigger className="min-w-[60px]">
                        <SelectValue placeholder="" />
                      </SelectTrigger>
                      <SelectContent>
                        {["true", "false"].map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input disabled />
                  )}
                </td>

                <td>
                  <Button
                    onClick={() => removeFilter(i)}
                    variant="ghost"
                    disabled={disabled}
                    size="xs"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!disabled ? (
        <Button
          onClick={() => addNewFilter()}
          type="button" // required as it will otherwise submit forms where this component is used
          className="mt-2"
          variant="ghost"
          size="sm"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add filter
        </Button>
      ) : null}
    </>
  );
}
