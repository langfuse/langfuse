import { useState } from "react";
import {
  traceTranscriptFilterDefinition,
  type FilterState,
} from "@langfuse/shared";
import {
  TOPICS_RULE_FILTER_HINT,
  topicRuleFilterError,
} from "@langfuse/shared/topics";
import { env } from "@/src/env.mjs";
import { SampleObservationSelectorBase } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/SampleObservationSelectorBase";
import { RULE_SAMPLE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { compactNumberFormatter } from "@/src/utils/numbers";

const ruleColumns = new Set(
  traceTranscriptFilterDefinition.columns.map((column) => column.id),
);
// Rules match at ingestion, so they only offer the trace-transcript filter fields.
const topicsFilterRegistry = {
  ...RULE_SAMPLE_FIELD_REGISTRY,
  fields: RULE_SAMPLE_FIELD_REGISTRY.fields.filter((field) =>
    ruleColumns.has(field.filterColumn ?? field.id),
  ),
  columns: RULE_SAMPLE_FIELD_REGISTRY.columns.filter((column) =>
    ruleColumns.has(column.id),
  ),
  filterStateErrors: (filters: FilterState) => {
    const error = topicRuleFilterError(filters);
    return error ? [error] : [];
  },
};

const PREVIEW_WINDOW_MS = 7 * 86_400_000;

/** The first rule's trace filter in the setup flow, with the observations it matches. */
export function TopicTraceFilterSection({
  projectId,
  filters,
  onFiltersChange,
}: {
  projectId: string;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  // Matches the setup backfill window.
  const [timeRange] = useState(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - PREVIEW_WINDOW_MS), to };
  });
  return (
    <div className="ph-no-capture contents">
      <SampleObservationSelectorBase
        projectId={projectId}
        timeRange={timeRange}
        filterState={filters}
        onFilterStateChange={onFiltersChange}
        previewFilters={filters}
        tableName="topics-setup-matching-spans"
        registry={topicsFilterRegistry}
        selectedObservationId={null}
        onSelect={() => undefined}
        onOpenTrace={(observation) => {
          if (!observation.traceId) return;
          window.open(
            `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/project/${projectId}/traces/${observation.traceId}?observation=${observation.id}`,
            "_blank",
            "noopener,noreferrer",
          );
        }}
        leadingColumns={[]}
        resolveSelection={() => undefined}
        getRowClassName={undefined}
        filterTitle="Filter traces"
        matchingTitle="Matching traces"
        filterDescription="A trace matches when one of its observations meets every filter."
        filterTooltip={TOPICS_RULE_FILTER_HINT}
        matchingDescription="Observations from the last seven days whose traces match the filters."
        matchingTooltip="A trace is analyzed when one of its observations matches. Each row is one matching observation."
        formatCount={(count) =>
          `(${compactNumberFormatter(count)} matching ${count === 1 ? "observation" : "observations"})`
        }
        mapObservedOptions={(observed) => observed}
      />
    </div>
  );
}
