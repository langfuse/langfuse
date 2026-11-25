import type { FilterState } from "@langfuse/shared";
import { formatFilterPreview } from "@/src/components/table/table-view-presets/lib/viewPreview";
import { FilterSummary } from "@/src/features/filters/components/FilterSummary";

export function EvaluatorFilterCell({
  filterState,
}: {
  filterState: FilterState;
}) {
  const title =
    filterState.length > 0
      ? filterState.map(formatFilterPreview).join(" · ")
      : undefined;

  return (
    <div
      className="flex w-full max-w-full min-w-0 items-center gap-2 overflow-hidden"
      title={title}
    >
      <FilterSummary className="ml-0" filterState={filterState} />
    </div>
  );
}
