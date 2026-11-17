import { type FilterState, type StudioQuery } from "@langfuse/shared";
import { InfoIcon } from "@langfuse/icons";
import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
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
      <div className="text-muted-foreground flex w-16 shrink-0 items-center gap-1 pt-2 text-xs">
        Filters
        {filters.some(
          (filter) =>
            filter.column.toLowerCase() === "metadata" &&
            ["is set", "is not set"].includes(filter.operator),
        ) ? (
          <Tooltip label="“Is set” includes keys with empty values. “Is not set” means the key is absent.">
            {({ getTriggerProps }) => (
              <IconButton
                {...getTriggerProps()}
                label="Metadata key presence"
                icon={InfoIcon}
                size="xs"
              />
            )}
          </Tooltip>
        ) : null}
      </div>
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
