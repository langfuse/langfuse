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
import { Filter, Plus, Trash } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { MultiSelect } from "@/src/features/filters/components/multi-select";
import {
  type WipFilterState,
  type FilterState,
  type WipFilterCondition,
} from "@/src/features/filters/types";
import { type ColumnDefinition } from "@/src/server/api/interfaces/tableDefinition";
import {
  filterOperators,
  singleFilter,
} from "@/src/server/api/interfaces/filters";

// Has WipFilterState, passes all valid filters to parent onChange
export function FilterBuilder({
  columns,
  filterState,
  onChange,
}: {
  columns: ColumnDefinition[];
  filterState: FilterState;
  onChange: Dispatch<SetStateAction<FilterState>>;
}) {
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
      },
    ]);
  };

  const setWipFilterState = (
    state: ((prev: WipFilterState) => WipFilterState) | WipFilterState,
  ) => {
    _setWipFilterState((prev) => {
      const newState = state instanceof Function ? state(prev) : state;
      onChange(
        newState.filter(
          (f) => singleFilter.safeParse(f).success,
        ) as FilterState,
      );
      return newState;
    });
  };

  return (
    <Popover
      onOpenChange={(open) => {
        // Create empty filter when opening popover
        if (open && filterState.length === 0) addNewFilter();
        // Discard all wip filters when closing popover
        if (!open) setWipFilterState(filterState);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Filter className="mr-3 h-4 w-4" />
          <span>Filter</span>
          {filterState.length > 0
            ? filterState.map((filter, i) => {
                return (
                  <span
                    key={i}
                    className="ml-3 rounded-md bg-slate-200 p-1 px-2 text-xs"
                  >
                    {filter.column} {filter.operator}{" "}
                    {filter.value
                      ? filter.type === "datetime"
                        ? new Date(filter.value).toLocaleDateString()
                        : filter.type === "stringOptions"
                        ? filter.value.join(", ")
                        : filter.type === "number"
                        ? filter.value
                        : `"${filter.value}"`
                      : null}
                  </span>
                );
              })
            : null}
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
        />
      </PopoverContent>
    </Popover>
  );
}

function FilterBuilderForm({
  columns,
  filterState,
  onChange,
}: {
  columns: ColumnDefinition[];
  filterState: WipFilterState;
  onChange: Dispatch<SetStateAction<WipFilterState>>;
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
            const column = columns.find((c) => c.name === filter.column);
            return (
              <tr key={i}>
                <td className="p-2">{i === 0 ? "Where" : "And"}</td>
                <td className="p-2">
                  <Select
                    value={filter.column ?? ""}
                    onValueChange={(value) =>
                      handleFilterChange(
                        {
                          column: value,
                          type: columns.find((c) => c.name === value)?.type,
                          operator: undefined,
                          value: undefined,
                        },
                        i,
                      )
                    }
                  >
                    <SelectTrigger className="min-w-[100px]">
                      <SelectValue placeholder="Column" />
                    </SelectTrigger>
                    <SelectContent>
                      {columns.map((option) => (
                        <SelectItem key={option.name} value={option.name}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-2">
                  <Select
                    disabled={!filter.column}
                    onValueChange={(value) => {
                      handleFilterChange(
                        {
                          ...filter,
                          operator: value as any,
                        },
                        i,
                      );
                    }}
                    value={filter.operator ?? ""}
                  >
                    <SelectTrigger className="min-w-[100px]">
                      <SelectValue placeholder="Operator" />
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
                <td className="p-2">
                  {filter.type === "datetime" ? (
                    <DatePicker
                      className="min-w-[100px]"
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
                  ) : filter.type === "stringOptions" &&
                    filter.operator &&
                    ["any of", "none of"].includes(filter.operator) ? (
                    <MultiSelect
                      title="Value"
                      className="min-w-[100px]"
                      options={
                        column?.type === "stringOptions" ? column.options : []
                      }
                      onValueChange={(value) =>
                        handleFilterChange({ ...filter, value }, i)
                      }
                      values={Array.isArray(filter.value) ? filter.value : []}
                    />
                  ) : filter.type === "number" ? (
                    <Input
                      value={filter.value?.toString() ?? ""}
                      placeholder="number"
                      onChange={(e) =>
                        handleFilterChange(
                          {
                            ...filter,
                            value:
                              isNaN(Number(e.target.value)) ||
                              e.target.value.endsWith(".")
                                ? e.target.value
                                : Number(e.target.value),
                          },
                          i,
                        )
                      }
                    />
                  ) : filter.type === "string" ? (
                    <Input
                      value={filter.value ?? ""}
                      placeholder="string"
                      onChange={(e) =>
                        handleFilterChange(
                          { ...filter, value: e.target.value },
                          i,
                        )
                      }
                    />
                  ) : (
                    <Input disabled />
                  )}
                </td>
                <td>
                  <Button onClick={() => removeFilter(i)} variant="ghost">
                    <Trash className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Button
        onClick={() => addNewFilter()}
        className="mt-2"
        variant="ghost"
        size="sm"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add filter
      </Button>
      <pre>{JSON.stringify(filterState, null, 2)}</pre>
    </>
  );
}
