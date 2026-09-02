import type { ColumnDefinition, FilterState } from "@langfuse/shared";

import { InlineFilterBuilder } from "@/src/features/filters";

export function ObservationFilterBuilder({
  columns,
  filterState,
  onChange,
  queryOnlyColumnIds,
}: {
  columns: ColumnDefinition[];
  filterState: FilterState;
  onChange: (filters: FilterState) => void;
  queryOnlyColumnIds: string[];
}) {
  return (
    <div className="[&_table]:w-full [&_table]:table-fixed [&_td:first-child]:w-16 [&_td:last-child]:w-8 [&_td:last-child]:text-right [&_td:nth-child(2)]:w-56 [&_td:nth-child(3)]:w-40">
      <InlineFilterBuilder
        columns={columns}
        filterState={filterState}
        onChange={onChange}
        columnIdentifier="id"
        columnsHiddenUnlessSelected={queryOnlyColumnIds}
        subtleAddButton
        columnsWithCustomSelect={[
          "tags",
          "name",
          "traceName",
          "calledToolNames",
        ]}
      />
    </div>
  );
}
