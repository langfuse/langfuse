import { type ColumnDef } from "@tanstack/react-table";
import type { FilterState } from "@langfuse/shared";
import { TOPICS_RULE_FILTER_HINT } from "@langfuse/shared/topics";
import { Table } from "@/src/components/design-system/table/Table";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
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

/** The first rule's trace filter in the setup flow, with the latest traces it matches. */
export function TopicTraceFilterSection({
  projectId,
  filters,
  onFiltersChange,
  model,
}: {
  projectId: string;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  model: TopicTraceFilterModel;
}) {
  return (
    <div className="ph-no-capture flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <SectionHeader
          title="Filter traces"
          meta={null}
          description="A trace matches when one of its observations meets every filter."
          tooltip={TOPICS_RULE_FILTER_HINT}
          trailing={
            <FilterModeToggle mode={model.mode} onChange={model.changeMode} />
          }
        />
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
            />
            {model.error ? (
              <p className="text-destructive text-xs">{model.error}</p>
            ) : null}
          </>
        )}
      </section>
      <section className="flex min-h-0 flex-col gap-2">
        <SectionHeader
          title="Matching traces"
          meta={
            model.preview.status === "ready" ? (
              <MatchedTraceCount count={model.preview.count} />
            ) : null
          }
          description="The latest traces from the last seven days that match the filters."
          tooltip="Traces that are still running are included."
          trailing={null}
        />
        <div className="flex h-72 min-h-0 min-w-0 flex-col overflow-hidden rounded-md border">
          <Table
            tableName="Topics setup matching traces"
            columns={matchingTraceColumns(projectId)}
            data={tableData(model.preview)}
            onRowClick={(trace) => openTrace(projectId, trace.id)}
            noResultsMessage={
              model.preview.status === "invalid"
                ? "Fix the filter to preview matching traces."
                : "No traces in the last seven days match these filters."
            }
          />
        </div>
      </section>
    </div>
  );
}

function MatchedTraceCount({ count }: { count: number }) {
  const unit = count === 1 ? "trace" : "traces";
  return (
    <span className="text-muted-foreground shrink-0 text-sm">
      ({compactNumberFormatter(count)} {unit})
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

function matchingTraceColumns(
  projectId: string,
): ColumnDef<TopicTracePreviewRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Trace",
      size: 320,
      cell: ({ row }) => (
        <TraceNameCell projectId={projectId} trace={row.original} />
      ),
    },
    {
      accessorKey: "timestamp",
      header: "First match",
      size: 176,
      cell: ({ row }) => new Date(row.original.timestamp).toLocaleString(),
    },
    { accessorKey: "environment", header: "Environment", size: 128 },
  ];
}

function TraceNameCell({
  projectId,
  trace,
}: {
  projectId: string;
  trace: TopicTracePreviewRow;
}) {
  return (
    <div className="min-w-0">
      <TextLink
        path={tracePath(projectId, trace.id)}
        value={trace.name ?? trace.id}
        onClick={() => openTrace(projectId, trace.id)}
      />
      {trace.name ? (
        <span
          title={trace.id}
          className="text-muted-foreground block truncate font-mono text-xs"
        >
          {trace.id}
        </span>
      ) : null}
    </div>
  );
}
