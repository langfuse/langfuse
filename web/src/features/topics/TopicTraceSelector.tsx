import { useState, type ReactNode } from "react";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { shouldIgnoreRowClickTarget } from "@/src/components/table/shouldIgnoreRowClickTarget";
import { format } from "date-fns";
import {
  eventsEvalFilterColumns,
  experimentEvalFilterColsWithOptions,
  observationEvalFilterColsWithOptions,
  type FilterState,
  type TimeFilter,
} from "@langfuse/shared";
import { api, type RouterInputs, type RouterOutputs } from "@/src/utils/api";
import type { TopicRule } from "@langfuse/shared/topics";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { TableSearchBar, toObservedOptions } from "@/src/features/search-bar";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import { FilterModeToggle } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/FilterModeToggle";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { DateRangeInput } from "@/src/features/evals/v2/components/Evaluators/EvaluatorBackfillSettings/components/DateRangeInput/DateRangeInput";
import { parseTraceInput } from "./parse-trace-input";

type PreviewInput = RouterInputs["topics"]["previewTraces"];
export type TopicTraceCriteria = Pick<
  TopicRule,
  "filter" | "sampling" | "limit"
>;
type TracePreview = RouterOutputs["topics"]["previewTraces"]["traces"][number];
export type TopicTraceSelection = { count: number } & (
  | { traceIds: string[] }
  | {
      selection: Extract<
        RouterInputs["topics"]["trigger"],
        { selection: unknown }
      >["selection"];
    }
);
const DAY = 86_400_000;
const registry = { ...RULE_FIELD_REGISTRY, aiFilterPrompt: false };
const windows = [
  { id: "1", label: "Last 24 hours" },
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "90", label: "Last 90 days" },
  { id: "custom", label: "Custom range" },
];

function calendarRange(from: string, to: string) {
  const end = new Date(`${to}T00:00:00`);
  end.setDate(end.getDate() + 1);
  return { from: new Date(`${from}T00:00:00`), to: end };
}

export function TopicTraceSelector({
  projectId,
  initialCriteria,
  children,
}: {
  projectId: string;
  initialCriteria?: TopicTraceCriteria;
  children: (
    selection: TopicTraceSelection | null,
    criteria: TopicTraceCriteria | null,
  ) => ReactNode;
}) {
  const [mode, setMode] = useState("filters");
  const [filterMode, setFilterMode] = useState<"builder" | "query">("builder");
  const [filter, setFilter] = useState<FilterState>(
    initialCriteria?.filter ?? [],
  );
  const [timeWindow, setTimeWindow] = useState("7");
  const [range, setRange] = useState(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - 7 * DAY), to };
  });
  const [sample, setSample] = useState(initialCriteria?.limit != null);
  const [limit, setLimit] = useState(String(initialCriteria?.limit ?? 100));
  const [sampling, setSampling] = useState<"random" | "latest">(
    initialCriteria?.sampling ?? "random",
  );
  const [paste, setPaste] = useState("");
  const [request, setRequest] = useState<PreviewInput | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const validLimit =
    !sample || (Number.isSafeInteger(Number(limit)) && Number(limit) >= 1);
  const validRange =
    range.from < range.to &&
    range.to.getTime() - range.from.getTime() <= 93 * DAY;
  const preview = api.topics.previewTraces.useQuery(
    request ?? {
      projectId,
      filter: [],
      ...range,
      limit: null,
      sampling: "random",
      seed: "unselected",
    },
    {
      enabled: (query) =>
        request !== null &&
        mode === "filters" &&
        query.state.data === undefined,
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: false,
    },
  );
  const ready =
    mode === "filters" &&
    request !== null &&
    !preview.isFetching &&
    !preview.error
      ? preview.data
      : undefined;
  const excludedIds = new Set(excluded);
  const selectedCount = ready
    ? ready.selectedTraceCount -
      ready.traces.filter((trace) => excludedIds.has(trace.id)).length
    : 0;
  let pastedIds: string[] | null = null;
  let pasteError: string | null = null;
  if (mode === "paste" && paste.trim()) {
    try {
      pastedIds = parseTraceInput(
        paste,
        projectId,
        typeof window === "undefined" ? "" : window.location.origin,
      );
    } catch (error) {
      pasteError =
        error instanceof Error ? error.message : "Invalid trace IDs.";
    }
  }
  const startTimeFilter: TimeFilter[] = [
    {
      column: "startTime",
      type: "datetime",
      operator: ">=",
      value: range.from,
    },
    { column: "startTime", type: "datetime", operator: "<", value: range.to },
  ];
  const options = useEventsFilterOptions({
    projectId,
    startTimeFilter,
    refiningFilter: filter.map((item) =>
      item.column === "tags" ? { ...item, column: "traceTags" } : item,
    ),
    lazy: filterMode === "query",
    columns: [
      "environment",
      "name",
      "traceTags",
      "traceName",
      "calledToolNames",
      "experimentDatasetId",
      "experimentId",
    ],
    enabled: mode === "filters" && validRange,
  });
  const observed = toObservedOptions(
    options.filterOptions,
    options.isFilterOptionsPending,
  );
  const builderColumns = experimentEvalFilterColsWithOptions(
    options.filterOptions,
    observationEvalFilterColsWithOptions(
      { ...options.filterOptions, tags: options.filterOptions?.traceTags },
      [...eventsEvalFilterColumns],
    ),
  ).map((column) =>
    column.id === "experimentId" && column.type === "stringOptions"
      ? { ...column, options: options.filterOptions?.experimentId ?? [] }
      : column,
  );
  const previewTraces = () => {
    setExcluded([]);
    setRequest({
      projectId,
      filter,
      ...range,
      limit: sample ? Number(limit) : null,
      sampling,
      seed: crypto.randomUUID(),
    });
  };

  return (
    <div className="ph-no-capture flex min-w-0 flex-col gap-4">
      <Tabs
        value={mode}
        onValueChange={(value) => {
          setMode(value);
          setRequest(null);
        }}
      >
        <Tabs.List aria-label="Trace selection method">
          <Tabs.Trigger value="filters" label="Filters" />
          <Tabs.Trigger value="paste" label="Paste IDs" />
        </Tabs.List>
      </Tabs>
      {mode === "filters" ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Time range
              <Select
                value={timeWindow}
                onValueChange={(value) => {
                  setTimeWindow(value);
                  setRequest(null);
                  if (value !== "custom") {
                    const to = new Date();
                    setRange({
                      from: new Date(to.getTime() - Number(value) * DAY),
                      to,
                    });
                  } else {
                    setRange(
                      calendarRange(
                        format(range.from, "yyyy-MM-dd"),
                        format(range.to, "yyyy-MM-dd"),
                      ),
                    );
                  }
                }}
              >
                <SelectTrigger className="w-44" aria-label="Trace time range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="ph-no-capture">
                  {windows.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex h-8 items-center gap-2 text-sm">
              <Checkbox
                checked={sample}
                onCheckedChange={(value) => {
                  setSample(value === true);
                  setRequest(null);
                }}
              />
              Sample traces
            </label>
            {sample && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  Sample up to
                  <Input
                    aria-label="Maximum traces"
                    className="w-28"
                    type="number"
                    min={1}
                    value={limit}
                    onChange={(event) => {
                      setLimit(event.target.value);
                      setRequest(null);
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Selection
                  <Select
                    value={sampling}
                    onValueChange={(value) => {
                      setSampling(value as "random" | "latest");
                      setRequest(null);
                    }}
                  >
                    <SelectTrigger
                      className="w-44"
                      aria-label="Trace sampling method"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="ph-no-capture">
                      <SelectItem value="random">Random sample</SelectItem>
                      <SelectItem value="latest">Newest first</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </>
            )}
          </div>
          {timeWindow === "custom" && (
            <DateRangeInput
              value={{
                from: format(range.from, "yyyy-MM-dd"),
                to: format(new Date(range.to.getTime() - 1), "yyyy-MM-dd"),
              }}
              max={format(new Date(), "yyyy-MM-dd")}
              fromAriaLabel="Trace start date"
              toAriaLabel="Trace end date"
              onValueChange={(value) => {
                setRange(calendarRange(value.from, value.to));
                setRequest(null);
              }}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold">Filter observations</h3>
            <FilterModeToggle mode={filterMode} onChange={setFilterMode} />
          </div>
          {filterMode === "builder" ? (
            <ObservationFilterBuilder
              columns={builderColumns}
              filterState={filter}
              queryOnlyColumnIds={registry.fields
                .filter((field) => field.directFilter === false)
                .map((field) => field.filterColumn ?? field.id)}
              onChange={(value) => {
                setFilter(value);
                setRequest(null);
              }}
            />
          ) : (
            <>
              <TableSearchBar
                projectId={projectId}
                tableName="topics-trace-selection"
                registry={registry}
                filterState={filter}
                setFilterState={(value) => {
                  setFilter(value);
                  setRequest(null);
                }}
                observed={
                  observed
                    ? { ...observed, tags: observed.traceTags ?? [] }
                    : undefined
                }
                isV4
                onRequestColumns={options.requestColumns}
                erroredColumns={options.erroredColumns}
              />
              <p className="text-muted-foreground text-xs">
                Press Enter to apply your query before previewing.
              </p>
            </>
          )}
          <p className="text-muted-foreground text-sm">
            A trace is included when an observation matches all filters in this
            time range. Topics uses the whole trace transcript, including
            observations outside these filters.
          </p>
          {!validLimit && (
            <p role="alert" className="text-destructive text-sm">
              Enter a positive whole number of traces.
            </p>
          )}
          {!validRange && (
            <p role="alert" className="text-destructive text-sm">
              Choose a start before the end, within a 93-day window.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={
              !validLimit ||
              !validRange ||
              (request !== null && preview.isFetching)
            }
            onClick={previewTraces}
          >
            {request !== null && preview.isFetching
              ? "Loading preview…"
              : ready
                ? "Refresh selection"
                : "Preview traces"}
          </Button>
          {request !== null && preview.error && (
            <p role="alert" className="text-destructive text-sm">
              {preview.error.message}
            </p>
          )}
          {ready ? (
            <>
              <p role="status" className="text-sm">
                {ready.matchedTraceCount.toLocaleString()} matching traces ·{" "}
                {selectedCount.toLocaleString()} selected
                {request?.limit
                  ? ` · sample of ${ready.selectedTraceCount.toLocaleString()}`
                  : " · all matches selected"}
              </p>
              <p className="text-muted-foreground text-xs">
                Showing {ready.traces.length.toLocaleString()} preview traces.
                The matching traces are selected when you run Topics; counts may
                change as new data arrives. Unchecked traces are excluded.
              </p>
              <TracePreviewTable
                key={request?.seed}
                traces={ready.traces}
                excluded={excluded}
                onExcludedChange={setExcluded}
              />
            </>
          ) : (
            <p className="text-muted-foreground text-xs">
              Preview the matching traces before running topics. Previewing does
              not use a model.
            </p>
          )}
        </>
      ) : (
        <label className="flex flex-col gap-2 text-sm font-bold">
          Trace IDs or links
          <Textarea
            aria-label="Trace IDs or links"
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            placeholder="One trace ID or local trace link per line"
            className="min-h-32 font-mono text-xs"
          />
          <span className="text-muted-foreground font-normal">
            Unique trace IDs from this project.
            {pastedIds ? ` ${pastedIds.length} selected.` : ""}
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
      {children(
        mode === "paste"
          ? pastedIds
            ? { traceIds: pastedIds, count: pastedIds.length }
            : null
          : request && selectedCount > 0
            ? {
                count: selectedCount,
                selection: {
                  filter: request.filter,
                  from: request.from,
                  to: request.to,
                  limit: request.limit,
                  sampling: request.sampling,
                  seed: request.seed,
                  excludedTraceIds: excluded,
                },
              }
            : null,
        mode === "filters" && validLimit
          ? { filter, sampling, limit: sample ? Number(limit) : null }
          : null,
      )}
    </div>
  );
}

function TracePreviewTable({
  traces,
  excluded,
  onExcludedChange,
}: {
  traces: TracePreview[];
  excluded: string[];
  onExcludedChange: (ids: string[]) => void;
}) {
  const { openPeek } = usePeekNavigation({
    tableName: "topics-traces",
    isV4: false,
    queryParams: ["observation", "display", "timestamp", "traceId"],
  });
  const [page, setPage] = useState(0);
  const excludedIds = new Set(excluded);
  const selectedCount = traces.length - excludedIds.size;
  const pageCount = Math.max(1, Math.ceil(traces.length / 20));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="max-h-96 overflow-auto rounded-md border">
        <Table className="min-w-[36rem]">
          <TableHeader className="bg-background sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  aria-label="Select all previewed traces"
                  checked={
                    selectedCount === traces.length && traces.length > 0
                      ? true
                      : selectedCount > 0
                        ? "indeterminate"
                        : false
                  }
                  disabled={traces.length === 0}
                  onCheckedChange={(checked) =>
                    onExcludedChange(
                      checked === true ? [] : traces.map((trace) => trace.id),
                    )
                  }
                />
              </TableHead>
              <TableHead>Trace</TableHead>
              <TableHead className="w-44">Matching time</TableHead>
              <TableHead className="w-32">Environment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {traces.slice(page * 20, (page + 1) * 20).map((trace) => (
              <TableRow
                key={trace.id}
                className="cursor-pointer"
                onClick={(event) => {
                  if (!shouldIgnoreRowClickTarget(event.target))
                    openPeek(trace.id);
                }}
              >
                <TableCell density="comfortable">
                  <Checkbox
                    aria-label={`Select trace ${trace.id}`}
                    checked={!excludedIds.has(trace.id)}
                    onCheckedChange={(checked) =>
                      onExcludedChange(
                        checked === true
                          ? excluded.filter((id) => id !== trace.id)
                          : excluded.concat(trace.id),
                      )
                    }
                  />
                </TableCell>
                <TableCell density="comfortable">
                  <button
                    type="button"
                    className="block max-w-full truncate text-left underline"
                    title={trace.name ?? trace.id}
                    onClick={() => openPeek(trace.id)}
                  >
                    {trace.name ?? trace.id}
                  </button>
                  {trace.name && (
                    <span
                      title={trace.id}
                      className="text-muted-foreground block truncate font-mono text-xs"
                    >
                      {trace.id}
                    </span>
                  )}
                </TableCell>
                <TableCell density="comfortable">
                  {new Date(trace.timestamp).toLocaleString()}
                </TableCell>
                <TableCell density="comfortable">
                  <span title={trace.environment} className="block truncate">
                    {trace.environment}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {traces.length === 0 && (
          <p className="text-muted-foreground p-3 text-sm">
            No traces match these filters and time range.
          </p>
        )}
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous traces
          </Button>
          <span className="text-muted-foreground text-xs">
            Page {page + 1} of {pageCount}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            Next traces
          </Button>
        </div>
      )}
    </div>
  );
}
