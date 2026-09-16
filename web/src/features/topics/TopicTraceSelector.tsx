import { useState, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  eventsEvalFilterColumns,
  experimentEvalFilterColsWithOptions,
  observationEvalFilterColsWithOptions,
  type FilterState,
  type TimeFilter,
} from "@langfuse/shared";
import { TOPICS_MAX_TRACES } from "@langfuse/shared/topics";
import { api, type RouterInputs, type RouterOutputs } from "@/src/utils/api";
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
type TracePreview = RouterOutputs["topics"]["previewTraces"]["traces"][number];
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
  children,
}: {
  projectId: string;
  children: (traceIds: string[] | null) => ReactNode;
}) {
  const [mode, setMode] = useState("filters");
  const [filterMode, setFilterMode] = useState<"builder" | "query">("builder");
  const [filter, setFilter] = useState<FilterState>([]);
  const [timeWindow, setTimeWindow] = useState("7");
  const [range, setRange] = useState(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - 7 * DAY), to };
  });
  const [limit, setLimit] = useState("100");
  const [sampling, setSampling] = useState<"random" | "latest">("random");
  const [paste, setPaste] = useState("");
  const [request, setRequest] = useState<PreviewInput | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const validLimit =
    Number.isInteger(Number(limit)) &&
    Number(limit) >= 1 &&
    Number(limit) <= TOPICS_MAX_TRACES;
  const validRange =
    range.from < range.to &&
    range.to.getTime() - range.from.getTime() <= 93 * DAY;
  const preview = api.topics.previewTraces.useQuery(
    request ?? {
      projectId,
      filter: [],
      ...range,
      limit: 100,
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
  const selected =
    ready?.traces
      .filter((trace) => !excluded.includes(trace.id))
      .map((trace) => trace.id) ?? [];
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
      limit: Number(limit),
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
            <label className="flex flex-col gap-1 text-sm">
              Sample up to
              <Input
                aria-label="Maximum traces"
                className="w-28"
                type="number"
                min={1}
                max={TOPICS_MAX_TRACES}
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
              Select between 1 and {TOPICS_MAX_TRACES.toLocaleString()} traces.
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
                ? "Refresh sample"
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
                {ready.traces.length} sampled · {selected.length} selected
              </p>
              <p className="text-muted-foreground text-xs">
                This selection is fixed until you edit the criteria or refresh
                the sample. Only the selected trace IDs will be submitted.
              </p>
              <TracePreviewTable
                key={request?.seed}
                projectId={projectId}
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
            Up to {TOPICS_MAX_TRACES.toLocaleString()} unique traces from this
            project.{pastedIds ? ` ${pastedIds.length} selected.` : ""}
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
        mode === "paste" ? pastedIds : selected.length > 0 ? selected : null,
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
  const [page, setPage] = useState(0);
  const selectedCount = traces.filter(
    (trace) => !excluded.includes(trace.id),
  ).length;
  const pageCount = Math.max(1, Math.ceil(traces.length / 20));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="max-h-96 overflow-auto rounded-md border">
        <Table className="min-w-[36rem]">
          <TableHeader className="bg-background sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  aria-label="Select all sampled traces"
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
              <TableRow key={trace.id}>
                <TableCell density="comfortable">
                  <Checkbox
                    aria-label={`Select trace ${trace.id}`}
                    checked={!excluded.includes(trace.id)}
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
                  <Link
                    className="block truncate underline"
                    title={trace.name ?? trace.id}
                    href={`/project/${projectId}/traces/${encodeURIComponent(trace.id)}`}
                  >
                    {trace.name ?? trace.id}
                  </Link>
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
