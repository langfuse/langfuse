import { useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import type { FilterState } from "@langfuse/shared";
import { TOPICS_RULE_FILTER_HINT } from "@langfuse/shared/topics";
import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";
import { Table } from "@/src/components/design-system/table/Table";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { env } from "@/src/env.mjs";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";
import {
  topicsFilterQueryOnlyColumnIds,
  topicsFilterRegistry,
  type TopicTraceFilterModel,
  type TopicTracePreview,
  type TopicTracePreviewRow,
} from "./useTopicTraceFilter";

/** The first rule's trace filter in the setup flow, with the latest traces it matches. */
export function TopicTraceFilterSection(props: TopicTraceFilterSectionProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <TopicTraceFilterSectionView
      {...props}
      previewOpen={previewOpen}
      onPreviewOpenChange={setPreviewOpen}
    />
  );
}

type TopicTraceFilterSectionProps = {
  projectId: string;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  model: TopicTraceFilterModel;
  title?: string;
  /** Null hides the line under the title. */
  description?: string | null;
  /** Null hides the line under Matching traces. */
  previewDescription?: string | null;
  /** False keeps each matching trace to one line: its name only. */
  showTraceIds?: boolean;
  /** "collapsible" shows a count line and opens the table on demand. */
  previewMode?: "table" | "collapsible";
};

function TopicTraceFilterSectionView({
  projectId,
  filters,
  onFiltersChange,
  model,
  title = "Filter traces",
  description = "A trace matches when one of its observations meets every filter.",
  previewDescription = "The latest traces from the last seven days that match the filters.",
  showTraceIds = true,
  previewMode = "table",
  previewOpen,
  onPreviewOpenChange,
}: TopicTraceFilterSectionProps & {
  previewOpen: boolean;
  onPreviewOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="ph-no-capture flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        {description ? (
          <SectionHeader
            title={title}
            meta={null}
            description={description}
            tooltip={TOPICS_RULE_FILTER_HINT}
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
              tooltip={TOPICS_RULE_FILTER_HINT}
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
            />
            {model.error ? (
              <p className="text-destructive text-xs">{model.error}</p>
            ) : null}
          </>
        )}
        {previewMode === "collapsible" ? (
          <div className="flex items-center gap-3">
            <PreviewSummary preview={model.preview} />
            <ExpandToggle
              expanded={previewOpen}
              onExpandedChange={onPreviewOpenChange}
              label="Preview"
              expandedLabel="Hide preview"
              variant="icon"
              iconPosition="right"
              size="sm"
              tone="link"
            />
          </div>
        ) : null}
      </section>
      {previewMode === "collapsible" && !previewOpen ? null : (
        <section className="flex min-h-0 flex-col gap-2">
          {previewMode === "table" ? (
            <SectionHeader
              title="Matching traces"
              meta={
                model.preview.status === "ready" ? (
                  <MatchedTraceCount count={model.preview.count} />
                ) : null
              }
              description={previewDescription}
              tooltip="Traces that are still running are included."
              trailing={null}
            />
          ) : null}
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-md border",
              showTraceIds ? "h-72" : "h-48",
            )}
          >
            <Table
              tableName="Topics setup matching traces"
              rowHeight={showTraceIds ? undefined : "s"}
              topBorder={false}
              columns={matchingTraceColumns(projectId, showTraceIds)}
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
      )}
    </div>
  );
}

/** One line under the filter: how many traces match, or why none can be counted. */
function PreviewSummary({ preview }: { preview: TopicTracePreview }) {
  if (preview.status === "invalid")
    return (
      <span className="text-muted-foreground text-sm">
        Fix the filter to count matching traces.
      </span>
    );
  if (preview.status === "error")
    return <span className="text-destructive text-sm">{preview.message}</span>;
  const count = preview.status === "ready" ? preview.count : null;
  return (
    <span className="text-muted-foreground text-sm">
      <span className="text-foreground">
        {count === null ? "…" : compactNumberFormatter(count)}
      </span>{" "}
      {count === 1 ? "match" : "matches"}
    </span>
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
  showTraceIds: boolean,
): ColumnDef<TopicTracePreviewRow>[] {
  return [
    {
      accessorKey: "name",
      header: "Trace",
      size: 320,
      cell: ({ row }) => (
        <TraceNameCell
          projectId={projectId}
          trace={row.original}
          showTraceId={showTraceIds}
        />
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
  showTraceId,
}: {
  projectId: string;
  trace: TopicTracePreviewRow;
  showTraceId: boolean;
}) {
  // One-line rows are plain text; the row itself opens the trace.
  if (!showTraceId) {
    const label = trace.name ?? trace.id;
    return (
      <span className="block truncate text-sm" title={label}>
        {label}
      </span>
    );
  }
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
