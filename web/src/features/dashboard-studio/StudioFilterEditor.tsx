import { type FilterState, type StudioQuery } from "@langfuse/shared";
import { PlusIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
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
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold">Only include</p>
        <span className="text-muted-foreground text-xs">
          All conditions match
        </span>
      </div>
      <ConnectedMetricsFilterBuilder
        version={isV4 ? "v2" : "v1"}
        view={view}
        projectId={projectId}
        dateRange={dateRange}
        filters={filters}
        onChange={onChange}
      />
      <Button
        text="Metadata key exists"
        icon={PlusIcon}
        variant="ghost"
        size="sm"
        onClick={() =>
          onChange([
            ...filters,
            {
              type: "stringObject",
              column: "metadata",
              key: "abc",
              operator: "is set",
              value: "",
            },
          ])
        }
      />
    </div>
  );
}
