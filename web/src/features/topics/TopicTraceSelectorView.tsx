/* eslint-disable react/no-unstable-nested-components */
import { useState, type ChangeEvent, type ComponentProps } from "react";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { env } from "@/src/env.mjs";
import { type ColumnDef } from "@tanstack/react-table";
import { type FilterState } from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";
import { Button } from "@/src/components/design-system/Button/Button";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { Input } from "@/src/components/design-system/Input/Input";
import { Textarea } from "@/src/components/ui/textarea";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Table } from "@/src/components/design-system/table/Table";
import { PaginationBar } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { TableSearchBar } from "@/src/features/search-bar";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { TimeRangePicker } from "@/src/components/date-picker";
import { TIME_RANGES, type TimeRange } from "@/src/utils/date-range-utils";
import { TOPICS_BACKFILL_TRACE_LIMIT } from "./backfill-limit";
import { isValidTopicTimeRange } from "./time-range";

const registry = {
  ...RULE_FIELD_REGISTRY,
  aiFilterPrompt: false,
  fields: RULE_FIELD_REGISTRY.fields.filter(
    (field) => field.id !== "isRootObservation",
  ),
  columns: RULE_FIELD_REGISTRY.columns.filter(
    (column) => column.id !== "isRootObservation",
  ),
};

const traceTimeRanges = {
  "1": "last1Day",
  "7": "last7Days",
  "30": "last30Days",
  "90": "last90Days",
} as const;

export function TopicTraceSelectorView({
  projectId,
  mode,
  onModeChange,
  filterMode,
  onFilterModeChange,
  filter,
  onFilterChange,
  timeWindow,
  range,
  onTimeWindowChange,
  onRangeChange,
  limit,
  onLimitChange,
  sampling,
  onSamplingChange,
  paste,
  onPasteChange,
  pastedCount,
  pasteError,
  preview,
  onPreview,
  excluded,
  onExcludedChange,
  builderColumns,
  observed,
  onRequestColumns,
  erroredColumns,
}: TopicTraceSelectorViewProps) {
  const validLimit =
    Number.isSafeInteger(Number(limit)) &&
    Number(limit) >= 1 &&
    Number(limit) <= TOPICS_BACKFILL_TRACE_LIMIT;
  const validRange = isValidTopicTimeRange(range);
  const ready = preview.status === "ready" ? preview.data : undefined;
  const excludedIds = new Set(excluded);
  const selectedCount = ready
    ? ready.selectedTraceCount -
      ready.traces.filter((trace) => excludedIds.has(trace.id)).length
    : 0;
  const previewLabel = {
    idle: "Preview traces",
    loading: "Loading preview…",
    ready: "Refresh selection",
    error: "Preview traces",
  }[preview.status];
  const timeRange: TimeRange =
    timeWindow === "custom"
      ? range
      : {
          range:
            traceTimeRanges[timeWindow as keyof typeof traceTimeRanges] ??
            "last7Days",
        };
  function handleTimeRangeChange(value: TimeRange) {
    if ("from" in value) {
      onTimeWindowChange("custom");
      onRangeChange(value);
      return;
    }
    const minutes =
      TIME_RANGES[value.range as keyof typeof TIME_RANGES].minutes;
    if (minutes === null) return;
    onTimeWindowChange(String(minutes / (24 * 60)));
  }
  function handleLimitChange(event: ChangeEvent<HTMLInputElement>) {
    onLimitChange(event.target.value);
  }
  function handleSamplingChange(value: string) {
    onSamplingChange(value as "random" | "latest");
  }
  function handlePasteChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onPasteChange(event.target.value);
  }
  return (
    <div className="ph-no-capture flex min-w-0 flex-col gap-4">
      <Tabs value={mode} onValueChange={onModeChange}>
        <Tabs.List
          variant="inset"
          size="md"
          aria-label="Trace selection method"
        >
          <Tabs.Trigger value="filters" label="Filters" />
          <Tabs.Trigger value="paste" label="Paste IDs" />
        </Tabs.List>
      </Tabs>
      {mode === "filters" ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <TimeRangePicker
                timeRange={timeRange}
                onTimeRangeChange={handleTimeRangeChange}
                timeRangePresets={[
                  "last1Day",
                  "last7Days",
                  "last30Days",
                  "last90Days",
                ]}
                maxRangeMs={90 * 86_400_000}
                className="my-0"
              />
            </div>
            <label className="flex flex-col gap-1 text-sm">
              Maximum traces
              <div className="w-28">
                <Input
                  aria-label="Maximum traces"
                  type="number"
                  min={1}
                  value={limit}
                  onChange={handleLimitChange}
                />
              </div>
            </label>
            <label className="flex w-44 flex-col gap-1 text-sm">
              Selection
              <SelectInput
                aria-label="Trace sampling method"
                placeholder="Selection"
                options={[
                  { value: "random", label: "Random sample" },
                  { value: "latest", label: "Newest first" },
                ]}
                value={sampling}
                onValueChange={handleSamplingChange}
              />
            </label>
          </div>
          <p className="text-muted-foreground text-xs">
            Process up to {TOPICS_BACKFILL_TRACE_LIMIT.toLocaleString()}{" "}
            matching traces per run.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Filter observations</h3>
            <FilterModeToggle mode={filterMode} onChange={onFilterModeChange} />
          </div>
          {filterMode === "builder" ? (
            <ObservationFilterBuilder
              columns={builderColumns}
              filterState={filter}
              queryOnlyColumnIds={registry.fields
                .filter((field) => field.directFilter === false)
                .map((field) => field.filterColumn ?? field.id)}
              onChange={onFilterChange}
            />
          ) : (
            <>
              <TableSearchBar
                projectId={projectId}
                tableName="topics-trace-selection"
                registry={registry}
                filterState={filter}
                setFilterState={onFilterChange}
                observed={
                  observed
                    ? { ...observed, tags: observed.traceTags ?? [] }
                    : undefined
                }
                isV4
                onRequestColumns={onRequestColumns}
                erroredColumns={erroredColumns}
              />
              <p className="text-muted-foreground text-xs">
                Press Enter to apply your query before previewing.
              </p>
            </>
          )}
          <p className="text-muted-foreground text-sm">
            A trace is included when an observation matches all filters in this
            time range. Topics summarizes the available conversation in the
            trace, including messages outside these filters.
          </p>
          {!validLimit && (
            <Alert variant="destructive" size="sm">
              <Alert.Description>
                <p className="break-words">
                  Enter between 1 and{" "}
                  {TOPICS_BACKFILL_TRACE_LIMIT.toLocaleString()} traces.
                </p>
              </Alert.Description>
            </Alert>
          )}
          {!validRange && (
            <Alert variant="destructive" size="sm">
              <Alert.Description>
                <p className="break-words">
                  Choose a start before the end, within a 90-day window.
                </p>
              </Alert.Description>
            </Alert>
          )}
          <div className="self-start">
            <Button
              text={previewLabel}
              type="button"
              variant={ready ? "secondary" : "primary"}
              disabled={
                !validLimit || !validRange || preview.status === "loading"
              }
              onClick={onPreview}
            />
          </div>
          {preview.status === "error" && (
            <Alert variant="destructive" size="sm">
              <Alert.Description>
                <p className="break-words">{preview.message}</p>
              </Alert.Description>
            </Alert>
          )}
          {ready ? (
            <>
              <p role="status" className="text-sm">
                {ready.matchedTraceCount.toLocaleString()} matching traces ·{" "}
                {selectedCount.toLocaleString()} selected
                {` · sample of ${ready.selectedTraceCount.toLocaleString()}`}
              </p>
              <p className="text-muted-foreground text-xs">
                Showing {ready.traces.length.toLocaleString()} preview traces.
                The matching traces are selected when you run Topics; counts may
                change as new data arrives. Unchecked traces are excluded.
              </p>
              <TracePreviewTable
                key={preview.status === "ready" ? preview.seed : undefined}
                projectId={projectId}
                traces={ready.traces}
                excluded={excluded}
                onExcludedChange={onExcludedChange}
              />
            </>
          ) : (
            <p className="text-muted-foreground text-xs">
              First preview and select your traces. Then choose Summarize &amp;
              embed to start the run. Previewing does not use a model.
            </p>
          )}
        </>
      ) : (
        <label className="flex flex-col gap-2 text-sm font-bold">
          Trace IDs or links
          <Textarea
            aria-label="Trace IDs or links"
            value={paste}
            onChange={handlePasteChange}
            placeholder="One trace ID or local trace link per line"
            className="min-h-32 font-mono text-xs"
          />
          <span className="text-muted-foreground font-normal">
            Up to {TOPICS_BACKFILL_TRACE_LIMIT.toLocaleString()} unique trace
            IDs from this project.
            {pastedCount !== null ? ` ${pastedCount} selected.` : ""}
          </span>
          {pasteError && (
            <span
              role="alert"
              className="text-destructive font-normal break-words"
            >
              {pasteError}
            </span>
          )}
        </label>
      )}
    </div>
  );
}

function TracePreviewTable({
  projectId,
  traces,
  excluded,
  onExcludedChange,
}: {
  projectId: string;
  traces: TracePreview[];
  excluded: string[];
  onExcludedChange: (ids: string[]) => void;
}) {
  const openTrace = (traceId: string) => {
    const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";
    window.open(
      `${basePath}/project/${projectId}/traces/${encodeURIComponent(traceId)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  const [page, setPage] = useState(0);
  const excludedIds = new Set(excluded);
  const selectedCount = traces.length - excludedIds.size;
  const pageCount = Math.max(1, Math.ceil(traces.length / 20));
  const allChecked: boolean | "indeterminate" = (() => {
    if (selectedCount === traces.length && traces.length > 0) return true;
    if (selectedCount > 0) return "indeterminate";
    return false;
  })();
  function handleSelectAll(checked: boolean | "indeterminate") {
    onExcludedChange(checked === true ? [] : traces.map((trace) => trace.id));
  }
  function handleRowClick(trace: TracePreview) {
    openTrace(trace.id);
  }
  function handlePageChange(next: { pageIndex: number }) {
    setPage(next.pageIndex);
  }
  const columns: ColumnDef<TracePreview>[] = [
    {
      id: "selected",
      size: 48,
      enableResizing: false,
      header: () => (
        <Checkbox
          aria-label="Select all previewed traces"
          checked={allChecked}
          disabled={traces.length === 0}
          onCheckedChange={handleSelectAll}
        />
      ),
      cell: ({ row }) => {
        function handleCheckedChange(checked: boolean | "indeterminate") {
          onExcludedChange(
            checked === true
              ? excluded.filter((id) => id !== row.original.id)
              : excluded.concat(row.original.id),
          );
        }
        return (
          <Checkbox
            aria-label={`Select trace ${row.original.id}`}
            checked={!excludedIds.has(row.original.id)}
            onCheckedChange={handleCheckedChange}
          />
        );
      },
    },
    {
      accessorKey: "name",
      header: "Trace",
      size: 300,
      cell: ({ row: { original: trace } }) => {
        function handleClick() {
          openTrace(trace.id);
        }
        return (
          <div className="min-w-0">
            <TextLink
              path={`/project/${projectId}/traces/${encodeURIComponent(trace.id)}`}
              value={trace.name ?? trace.id}
              onClick={handleClick}
            />
            {trace.name && (
              <span
                title={trace.id}
                className="text-muted-foreground block truncate font-mono text-xs"
              >
                {trace.id}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "timestamp",
      header: "Matching time",
      size: 176,
      cell: ({ row }) => new Date(row.original.timestamp).toLocaleString(),
    },
    {
      accessorKey: "environment",
      header: "Environment",
      size: 128,
      cell: ({ row }) => (
        <span title={row.original.environment} className="block truncate">
          {row.original.environment}
        </span>
      ),
    },
  ];
  return (
    <div className="flex h-96 min-h-0 min-w-0 flex-col overflow-hidden rounded-md border">
      <Table
        tableName="Topics trace preview"
        columns={columns}
        data={{
          status: "success",
          data: traces.slice(page * 20, (page + 1) * 20),
        }}
        onRowClick={handleRowClick}
        noResultsMessage="No traces match these filters and time range."
      />
      {pageCount > 1 && (
        <PaginationBar
          mode="offset"
          totalCount={traces.length}
          state={{ pageIndex: page, pageSize: 20 }}
          onChange={handlePageChange}
          pageSizeOptions={[20]}
        />
      )}
    </div>
  );
}

type PreviewData = RouterOutputs["topics"]["previewTraces"];
type TracePreview = PreviewData["traces"][number];
type Range = { from: Date; to: Date };
type PreviewState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: PreviewData; seed: string };

export type TopicTraceSelectorViewProps = {
  projectId: string;
  mode: string;
  onModeChange: (value: string) => void;
  filterMode: "builder" | "query";
  onFilterModeChange: (value: "builder" | "query") => void;
  filter: FilterState;
  onFilterChange: (value: FilterState) => void;
  timeWindow: string;
  range: Range;
  onTimeWindowChange: (value: string) => void;
  onRangeChange: (value: Range) => void;
  limit: string;
  onLimitChange: (value: string) => void;
  sampling: "random" | "latest";
  onSamplingChange: (value: "random" | "latest") => void;
  paste: string;
  onPasteChange: (value: string) => void;
  pastedCount: number | null;
  pasteError: string | null;
  preview: PreviewState;
  onPreview: () => void;
  excluded: string[];
  onExcludedChange: (value: string[]) => void;
  builderColumns: ComponentProps<typeof ObservationFilterBuilder>["columns"];
  observed: ComponentProps<typeof TableSearchBar>["observed"];
  onRequestColumns: ComponentProps<typeof TableSearchBar>["onRequestColumns"];
  erroredColumns: ComponentProps<typeof TableSearchBar>["erroredColumns"];
};
