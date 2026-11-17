import {
  type ColumnDefinition,
  type FilterState,
  type TimeRange,
} from "@langfuse/shared";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import { useDashboardFilterOptions } from "@/src/hooks/useDashboardFilterOptions";
import { useEnvironmentFilterOptionsCache } from "@/src/hooks/use-environment-filter-options-cache";

export function StudioDashboardFilters({
  projectId,
  isV4,
  timeRange,
  filters,
  onChange,
}: {
  projectId: string;
  isV4: boolean;
  timeRange: TimeRange;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
}) {
  const { nameOptions, tagsOptions } = useDashboardFilterOptions({
    projectId,
    isV4,
    timeRange,
  });
  const { environmentOptions } = useEnvironmentFilterOptionsCache({
    projectId,
    timeRange,
  });
  const columns: ColumnDefinition[] = [
    {
      name: "Environment",
      id: "environment",
      type: "stringOptions",
      options: environmentOptions.map((value) => ({ value })),
      internal: "internalValue",
    },
    {
      name: "Trace name",
      id: "traceName",
      type: "stringOptions",
      options: nameOptions,
      internal: "internalValue",
    },
    {
      name: "Observation name",
      id: "observationName",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Score name",
      id: "scoreName",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Tags",
      id: "tags",
      type: "arrayOptions",
      options: tagsOptions,
      internal: "internalValue",
    },
    { name: "User", id: "user", type: "string", internal: "internalValue" },
    {
      name: "Session",
      id: "session",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Metadata",
      id: "metadata",
      type: "stringObject",
      internal: "internalValue",
    },
    {
      name: "Release",
      id: "release",
      type: "string",
      internal: "internalValue",
    },
    {
      name: "Version",
      id: "version",
      type: "string",
      internal: "internalValue",
    },
  ];
  return (
    <div className="ph-no-capture flex flex-wrap items-center gap-2">
      <PopoverFilterBuilder
        columns={columns}
        columnIdentifier="id"
        filterState={filters}
        onChange={onChange}
        label="Dashboard filters"
        tableName="dashboard-studio"
        isV4={isV4}
      />
    </div>
  );
}
