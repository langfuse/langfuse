import { useId, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import {
  traceTranscriptFilterDefinition,
  type FilterState,
} from "@langfuse/shared";
import { TOPICS_RULE_FILTER_HINT } from "@langfuse/shared/topics";
import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";
import { Table } from "@/src/components/design-system/table/Table";
import { env } from "@/src/env.mjs";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { compactNumberFormatter } from "@/src/utils/numbers";
import {
  topicsFilterQueryOnlyColumnIds,
  topicsFilterRegistry,
  type TopicTraceFilterModel,
  type TopicTracePreview,
  type TopicTracePreviewRow,
} from "./useTopicTraceFilter";

const matchingTraceColumns: ColumnDef<TopicTracePreviewRow>[] = [
  {
    accessorKey: "name",
    header: "Trace name",
    size: 320,
    // One-line rows; the row itself opens the trace.
    cell: ({ row }) => {
      const label = row.original.name ?? row.original.id;
      return (
        <span className="block truncate text-sm" title={label}>
          {label}
        </span>
      );
    },
  },
  {
    accessorKey: "timestamp",
    header: "Start time",
    size: 176,
    cell: ({ row }) => new Date(row.original.timestamp).toLocaleString(),
  },
  { accessorKey: "environment", header: "Environment", size: 128 },
];

const FILTER_TOOLTIP = `A trace matches when one of its observations meets every filter. ${TOPICS_RULE_FILTER_HINT}`;

type TopicTraceFilterSectionProps = {
  projectId: string;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  model: TopicTraceFilterModel;
  title?: string;
  /** Null hides the line under the title. */
  description?: string | null;
};

/** A scan's trace filter (setup, New scan, Edit scan), with the traces it matches. */
export function TopicTraceFilterSection({
  projectId,
  filters,
  onFiltersChange,
  model,
  title = "Filter traces",
  // Topics are clustered per scan, so each agent or app wants its own.
  description = "Topics runs on trace-level. If this project traces several agents or AI applications, filter to one so the topic maps are specific to your use case. Add a live scan for each.",
}: TopicTraceFilterSectionProps) {
  // The count is enough to judge a filter; the rows show on request.
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewId = useId();
  return (
    <div className="ph-no-capture flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        {description ? (
          <SectionHeader
            title={title}
            meta={null}
            description={description}
            tooltip={FILTER_TOOLTIP}
            trailing={
              <FilterModeToggle mode={model.mode} onChange={model.changeMode} />
            }
          />
        ) : (
          <div className="flex items-center justify-between gap-2">
            <SectionHeader
              title={title}
              meta={null}
              description={null}
              tooltip={FILTER_TOOLTIP}
              trailing={null}
            />
            <FilterModeToggle mode={model.mode} onChange={model.changeMode} />
          </div>
        )}
        {model.mode === "query" ? (
          <EventsSearchBarRow
            projectId={projectId}
            tableName="topics-setup-trace-filter"
            store={model.search.store}
            commit={model.search.commit}
            observed={model.observed}
            erroredColumns={model.erroredColumns}
            onRequestColumns={model.requestColumns}
            registry={topicsFilterRegistry}
            onApplyFilters={model.search.applyFilters}
            className="p-0"
          />
        ) : (
          <>
            <ObservationFilterBuilder
              columns={model.builderColumns}
              filterState={filters}
              onChange={onFiltersChange}
              queryOnlyColumnIds={topicsFilterQueryOnlyColumnIds}
              operators={traceTranscriptFilterDefinition.operators}
            />
            {model.error ? (
              <p className="text-destructive text-xs">{model.error}</p>
            ) : null}
          </>
        )}
      </section>
      <section className="flex min-h-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <MatchSummary preview={model.preview} />
          <span aria-hidden className="text-muted-foreground text-sm">
            ·
          </span>
          <ExpandToggle
            expanded={previewOpen}
            onExpandedChange={setPreviewOpen}
            label="Preview traces"
            expandedLabel="Hide traces"
            variant="icon"
            iconPosition="right"
            size="sm"
            controls={previewId}
          />
        </div>
        {previewOpen ? (
          <div
            id={previewId}
            className="flex max-h-48 min-h-0 min-w-0 flex-col overflow-hidden rounded-md border"
          >
            <Table
              tableName="Topics setup matching traces"
              rowHeight="s"
              topBorder={false}
              columns={matchingTraceColumns}
              data={tableData(model.preview)}
              onRowClick={(trace) => openTrace(projectId, trace.id)}
              noResultsMessage={
                model.preview.status === "invalid"
                  ? "Fix the filter to preview matching traces."
                  : "No traces in the last seven days match these filters."
              }
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

/** Grey text before the toggle: the match count, or why there is none. */
function MatchSummary({ preview }: { preview: TopicTracePreview }) {
  if (preview.status === "error")
    return <span className="text-destructive text-sm">{preview.message}</span>;
  if (preview.status === "invalid")
    return (
      <span className="text-muted-foreground text-sm">
        Fix the filter to count matching traces.
      </span>
    );
  if (preview.status !== "ready")
    return (
      <span className="text-muted-foreground text-sm">Counting traces…</span>
    );
  const unit = preview.count === 1 ? "trace" : "traces";
  return (
    <span className="text-muted-foreground text-sm">
      ~{compactNumberFormatter(preview.count)} matching {unit} in the last 7
      days
    </span>
  );
}

function tableData(preview: TopicTracePreview) {
  if (preview.status === "error")
    return { status: "error" as const, error: preview.message };
  if (preview.status === "loading") return { status: "loading" as const };
  // An invalid filter has nothing to preview; the empty state says why.
  const data = preview.status === "ready" ? preview.traces : [];
  return { status: "success" as const, data };
}

const tracePath = (projectId: string, traceId: string) =>
  `/project/${projectId}/traces/${encodeURIComponent(traceId)}`;

function openTrace(projectId: string, traceId: string) {
  window.open(
    `${env.NEXT_PUBLIC_BASE_PATH ?? ""}${tracePath(projectId, traceId)}`,
    "_blank",
    "noopener,noreferrer",
  );
}
