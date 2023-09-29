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
import { type Dispatch, type SetStateAction } from "react";
import { Filter, Plus, Trash } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import {
  type FilterState,
  type FilterColumns,
  type FilterCondition,
  filterOperators,
} from "@/src/features/filters/types";
import { isValidFilter } from "@/src/features/filters/lib/utils";

type FilterBuilderProps<cols extends FilterColumns = []> = {
  columns: cols;
  filterState: FilterState<cols>;
  onChange: Dispatch<SetStateAction<FilterState<cols>>>;
};

export function FilterBuilder<T extends FilterColumns>({
  columns,
  filterState,
  onChange,
}: FilterBuilderProps<T>) {
  const addNewFilter = () => {
    onChange((prev) => [
      ...prev,
      { column: null, operator: null, value: null },
    ]);
  };
  const removeUnfilledFilters = () => {
    onChange((prev) => prev.filter((f) => isValidFilter(f)));
  };
  return (
    <Popover
      onOpenChange={(open) => {
        // Create empty filter when opening popover
        if (open && filterState.length === 0) addNewFilter();
        // Remove filters that are not fully filled out when closing popover
        if (!open) removeUnfilledFilters();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Filter className="mr-3 h-4 w-4" />
          <span>Filter</span>
          {filterState.length > 0
            ? filterState
                .filter((f) => isValidFilter(f))
                .map((filter, i) => {
                  const colDtype = columns.find((c) => c.name === filter.column)
                    ?.type;

                  return (
                    <span
                      key={i}
                      className="ml-3 rounded-md bg-slate-200 p-1 px-2 text-xs"
                    >
                      {filter.column} {filter.operator}{" "}
                      {filter.value
                        ? colDtype === "datetime"
                          ? new Date(filter.value).toLocaleDateString()
                          : `"${filter.value}"`
                        : null}
                    </span>
                  );
                })
            : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-fit">
        <FilterBuilderForm
          columns={columns}
          filterState={filterState}
          onChange={onChange}
        />
      </PopoverContent>
    </Popover>
  );
}

function FilterBuilderForm<T extends FilterColumns>({
  columns,
  filterState,
  onChange,
}: FilterBuilderProps<T>) {
  const handleFilterChange = (filter: FilterCondition<T>, i: number) => {
    onChange((prev) => {
      const newState = [...prev];
      newState[i] = filter;
      return newState;
    });
  };

  const addNewFilter = () => {
    onChange((prev) => [
      ...prev,
      { column: null, operator: null, value: null },
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
            const colDtype = columns.find((c) => c.name === filter.column)
              ?.type;
            return (
              <tr key={i}>
                <td className="p-2">{i === 0 ? "Where" : "And"}</td>
                <td className="p-2">
                  <Select
                    value={filter.column ?? ""}
                    onValueChange={(value) =>
                      handleFilterChange(
                        {
                          ...filter,
                          column: value as typeof filter.column,
                          operator: null,
                          value: null,
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
                    onValueChange={(value) =>
                      handleFilterChange(
                        {
                          ...filter,
                          operator: value as typeof filter.operator,
                        },
                        i,
                      )
                    }
                    value={filter.operator ?? ""}
                  >
                    <SelectTrigger className="min-w-[100px]">
                      <SelectValue placeholder="Operator" />
                    </SelectTrigger>
                    <SelectContent>
                      {colDtype
                        ? filterOperators[colDtype].map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))
                        : null}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-2">
                  {colDtype === "datetime" ? (
                    <DatePicker
                      className="min-w-[100px]"
                      date={filter.value ? new Date(filter.value) : undefined}
                      onChange={(date) => {
                        handleFilterChange(
                          {
                            ...filter,
                            value: date ? date.toISOString() : null,
                          },
                          i,
                        );
                      }}
                    />
                  ) : (
                    <Input
                      disabled={!filter.operator}
                      value={filter.value ?? ""}
                      className="min-w-[100px]"
                      onChange={(e) =>
                        handleFilterChange(
                          { ...filter, value: e.target.value },
                          i,
                        )
                      }
                    />
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
    </>
  );
}
