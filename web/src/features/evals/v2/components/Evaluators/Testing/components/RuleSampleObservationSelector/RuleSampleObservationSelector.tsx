import { useMemo } from "react";
import { TopicsTargetObject, type FilterState } from "@langfuse/shared";

import type { AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { compactNumberFormatter } from "@/src/utils/numbers";
import {
  RULE_SAMPLE_FIELD_REGISTRY,
  TRACE_TRANSCRIPT_SAMPLE_FIELD_REGISTRY,
} from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import type { RuleTargetObject } from "@/src/features/evals/v2/types/rules";
import {
  SampleObservationSelectorBase,
  type SampleObservation,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";

function toEventsPreviewFilters(filters: FilterState): FilterState {
  return filters.map((filter) =>
    filter.column === "tags" ? { ...filter, column: "traceTags" } : filter,
  ) as FilterState;
}

const addRuleTagAlias: Parameters<
  typeof SampleObservationSelectorBase
>[0]["mapObservedOptions"] = (observed) =>
  observed === undefined
    ? undefined
    : { ...observed, tags: observed.traceTags ?? [] };

const resolveSelection: Parameters<
  typeof SampleObservationSelectorBase
>[0]["resolveSelection"] = (observations, selectedObservationId) => {
  const firstMatchingObservation = observations[0] ?? null;
  return selectedObservationId !== firstMatchingObservation?.id
    ? firstMatchingObservation
    : undefined;
};

export function RuleSampleObservationSelector({
  projectId,
  timeRange,
  filterState,
  onFilterStateChange,
  tableName,
  selectedObservationId,
  onSelect,
  onOpenTrace,
  targetObject,
  filterTitle,
  filterDescription,
  filterTooltip,
}: {
  projectId: string;
  timeRange: AbsoluteTimeRange | null;
  filterState: FilterState;
  onFilterStateChange: (filters: FilterState) => void;
  tableName: string;
  selectedObservationId: string | null;
  onSelect: (observation: SampleObservation | null) => void;
  onOpenTrace: (observation: SampleObservation) => void;
  targetObject: RuleTargetObject;
  filterTitle: string;
  filterDescription: string;
  filterTooltip: string;
}) {
  const previewFilters = useMemo(
    () => toEventsPreviewFilters(filterState),
    [filterState],
  );

  return (
    <SampleObservationSelectorBase
      projectId={projectId}
      timeRange={timeRange}
      filterState={filterState}
      onFilterStateChange={onFilterStateChange}
      previewFilters={previewFilters}
      tableName={tableName}
      registry={
        targetObject === TopicsTargetObject
          ? TRACE_TRANSCRIPT_SAMPLE_FIELD_REGISTRY
          : RULE_SAMPLE_FIELD_REGISTRY
      }
      selectedObservationId={selectedObservationId}
      onSelect={onSelect}
      onOpenTrace={onOpenTrace}
      leadingColumns={[]}
      resolveSelection={resolveSelection}
      getRowClassName={undefined}
      targetObject={targetObject}
      filterTitle={filterTitle}
      filterDescription={filterDescription}
      filterTooltip={filterTooltip}
      matchingDescription="The first match is used to preview attached evaluator mappings."
      matchingTooltip="Observations matching the rule filters over the last seven days."
      formatCount={(count) =>
        `(${compactNumberFormatter(count)} ${count === 1 ? "match" : "matches"})`
      }
      mapObservedOptions={addRuleTagAlias}
    />
  );
}
