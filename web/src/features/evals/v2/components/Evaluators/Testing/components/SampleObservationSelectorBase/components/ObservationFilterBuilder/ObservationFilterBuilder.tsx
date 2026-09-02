import type { ColumnDefinition, FilterState } from "@langfuse/shared";

import { InlineFilterBuilder } from "@/src/features/filters";
import { useElementSize } from "@/src/hooks/useElementSize";
import { cn } from "@/src/utils/tailwind";

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
  const [containerRef, containerSize] = useElementSize<HTMLDivElement>();
  const containerWidth = containerSize?.width;
  const isNarrow = containerWidth !== undefined && containerWidth < 720;
  const isCompact = containerWidth !== undefined && containerWidth < 480;

  return (
    <div
      ref={containerRef}
      className={cn(
        "[&_table]:w-full [&_table]:table-fixed [&_td:first-child]:w-16 [&_td:last-child]:w-8 [&_td:last-child]:text-right",
        isNarrow
          ? "[&_td:nth-child(2)]:w-40 [&_td:nth-child(3)]:w-32"
          : "[&_td:nth-child(2)]:w-56 [&_td:nth-child(3)]:w-40",
      )}
    >
      <InlineFilterBuilder
        columns={columns}
        filterState={filterState}
        onChange={onChange}
        columnIdentifier="id"
        columnsHiddenUnlessSelected={queryOnlyColumnIds}
        compact={isCompact}
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
