import type { ColumnDefinition, FilterState } from "@langfuse/shared";
import { useState, type ComponentProps } from "react";
import { isEqual } from "lodash";
import { FilterBuilderEditor } from "@/src/components/design-system/FilterBuilderEditor/FilterBuilderEditor";

export function ObservationFilterBuilder({
  columns,
  filterState,
  onChange,
  queryOnlyColumnIds,
  operators,
}: {
  columns: ColumnDefinition[];
  filterState: FilterState;
  onChange: (filters: FilterState) => void;
  queryOnlyColumnIds: string[];
  operators?: ComponentProps<typeof FilterBuilderEditor>["operators"];
}) {
  const [previousFilters, setPreviousFilters] = useState(filterState);
  const [lastEmitted, setLastEmitted] = useState<FilterState>();
  const [session, setSession] = useState(0);

  if (!isEqual(previousFilters, filterState)) {
    setPreviousFilters(filterState);
    if (!isEqual(lastEmitted, filterState)) setSession(session + 1);
    setLastEmitted(undefined);
  }

  const unsupported = filterState.filter(
    (filter) =>
      !columns.some(
        ({ id, name, aliases, type }) =>
          type === filter.type &&
          (filter.column === id ||
            filter.column === name ||
            aliases?.includes(filter.column)),
      ),
  );

  return (
    <FilterBuilderEditor
      key={session}
      columns={columns.map((column) => ({
        ...column,
        allowCustomValues: [
          "tags",
          "name",
          "traceName",
          "calledToolNames",
        ].includes(column.id),
      }))}
      initialFilters={filterState.filter(
        (filter) => !unsupported.includes(filter),
      )}
      onFiltersChange={(filters) => {
        const next = filters.map((filter) => ({
          ...filter,
          column:
            columns.find(({ name }) => name === filter.column)?.id ??
            filter.column,
        }));
        next.push(...unsupported);
        setLastEmitted(next);
        onChange(next);
      }}
      columnsHiddenUnlessSelected={queryOnlyColumnIds}
      operators={operators}
    />
  );
}
