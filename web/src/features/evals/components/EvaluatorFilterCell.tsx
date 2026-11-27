import type { FilterState } from "@langfuse/shared";
import { formatFilterPreview } from "@/src/components/table/table-view-presets/lib/viewPreview";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";

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
      <InlineFilterState className="ml-0" filterState={filterState} />
    </div>
  );
}
