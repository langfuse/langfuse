import { type FilterState, type StudioQuery } from "@langfuse/shared";
import { ConnectedMetricsFilterBuilder } from "@/src/features/metrics/components/ConnectedMetricsFilterBuilder";

export function StudioFilterEditor({
  projectId,
  view,
  isV4,
  dateRange,
  filters,
  onChange,
  onValidityChange,
}: {
  projectId: string;
  view: StudioQuery["view"];
  isV4: boolean;
  dateRange: { from: Date; to: Date };
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  return (
    <div className="ph-no-capture flex min-w-0 items-start gap-3">
      <p className="text-muted-foreground w-16 shrink-0 pt-2 text-xs">
        Filters
      </p>
      <div className="min-w-0 flex-1 overflow-x-auto">
        <ConnectedMetricsFilterBuilder
          compact={false}
          version={isV4 ? "v2" : "v1"}
          view={view}
          projectId={projectId}
          dateRange={dateRange}
          filters={filters}
          onChange={onChange}
          onValidityChange={onValidityChange}
        />
      </div>
    </div>
  );
}
