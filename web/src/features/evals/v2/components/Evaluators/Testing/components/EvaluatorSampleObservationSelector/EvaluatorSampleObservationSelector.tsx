import { useMemo } from "react";
import { Star } from "lucide-react";
import type { FilterState } from "@langfuse/shared";

import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import type { AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { compactNumberFormatter } from "@/src/utils/numbers";
import {
  SampleObservationSelectorBase,
  type SampleObservation,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";

const preserveObservedOptions: Parameters<
  typeof SampleObservationSelectorBase
>[0]["mapObservedOptions"] = (observed) => observed;

const resolveSelection: Parameters<
  typeof SampleObservationSelectorBase
>[0]["resolveSelection"] = (observations, selectedObservationId) => {
  const selectedObservationMatches = observations.some(
    (observation) => observation.id === selectedObservationId,
  );
  return (selectedObservationId === null && observations.length > 0) ||
    (selectedObservationId !== null && !selectedObservationMatches)
    ? (observations[0] ?? null)
    : undefined;
};

export function EvaluatorSampleObservationSelector({
  projectId,
  timeRange,
  selectedObservationId,
  filterState,
  onFilterStateChange,
  onSelect,
  onOpenTrace,
}: {
  projectId: string;
  timeRange: AbsoluteTimeRange | null;
  selectedObservationId: string | null;
  filterState: FilterState;
  onFilterStateChange: (filters: FilterState) => void;
  onSelect: (observation: SampleObservation | null) => void;
  onOpenTrace: (observation: SampleObservation) => void;
}) {
  const leadingColumns = useMemo<LangfuseColumnDef<SampleObservation>[]>(
    () => [
      {
        accessorKey: "sample",
        id: "sample",
        header: () => (
          <>
            <Star aria-hidden="true" className="h-4 w-4" />
            <span className="sr-only">Sample</span>
          </>
        ),
        size: 72,
        enableHiding: false,
        isFixedPosition: true,
        isPinnedLeft: true,
        cell: ({ row }) => (
          <Checkbox
            checked={selectedObservationId === row.original.id}
            aria-label={`Use ${row.original.name ?? row.original.id} as sample`}
            onCheckedChange={() => onSelect(row.original)}
          />
        ),
      },
    ],
    [onSelect, selectedObservationId],
  );

  return (
    <SampleObservationSelectorBase
      projectId={projectId}
      timeRange={timeRange}
      filterState={filterState}
      onFilterStateChange={onFilterStateChange}
      previewFilters={filterState}
      tableName="evaluator-sample-observations"
      registry={undefined}
      selectedObservationId={selectedObservationId}
      onSelect={onSelect}
      onOpenTrace={onOpenTrace}
      leadingColumns={leadingColumns}
      resolveSelection={resolveSelection}
      getRowClassName={(observation) =>
        observation.id === selectedObservationId ? "bg-muted/50" : ""
      }
      filterDescription="Narrow the observations to representative test data for this evaluator."
      filterTooltip="Filters only affect which observations are available as test samples."
      matchingDescription="Select an observation to test and verify the variable mapping."
      matchingTooltip="Observations matching the current filters and time range."
      formatCount={(count) => `(${compactNumberFormatter(count)})`}
      mapObservedOptions={preserveObservedOptions}
    />
  );
}
