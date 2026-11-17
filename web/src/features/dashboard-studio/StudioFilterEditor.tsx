import { type FilterState, type StudioQuery } from "@langfuse/shared";
import { ConnectedMetricsFilterBuilder } from "@/src/features/metrics/components/ConnectedMetricsFilterBuilder";

export function StudioFilterEditor({
  projectId,
  view,
  isV4,
  dateRange,
  filters,
  onChange,
}: {
  projectId: string;
  view: StudioQuery["view"];
  isV4: boolean;
  dateRange: { from: Date; to: Date };
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}) {
  return (
    <div className="ph-no-capture flex flex-col gap-2">
      <p className="text-xs font-bold">Filters</p>
      <ConnectedMetricsFilterBuilder
        version={isV4 ? "v2" : "v1"}
        view={view}
        projectId={projectId}
        dateRange={dateRange}
        filters={filters}
        onChange={onChange}
      />
    </div>
  );
}
