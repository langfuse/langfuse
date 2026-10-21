import { useState } from "react";
import { useDebounce } from "@/src/hooks/useDebounce";
import {
  eventsEvalFilterColumns,
  experimentEvalFilterColsWithOptions,
  observationEvalFilterColsWithOptions,
  type FilterState,
  type TimeFilter,
} from "@langfuse/shared";
import { api, type RouterInputs } from "@/src/utils/api";
import { toObservedOptions } from "@/src/features/search-bar";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import {
  TopicTraceSelectorView,
  type TopicTraceSelectorViewProps,
} from "./TopicTraceSelectorView";
import { parseTraceInput } from "./parse-trace-input";
import { TOPICS_BACKFILL_TRACE_LIMIT } from "./backfill-limit";
import {
  isValidTopicTimeRange,
  relativeTopicTimeRange,
  topicCalendarDates,
  topicCalendarRange,
} from "./time-range";

type PreviewInput = RouterInputs["topics"]["previewTraces"];
type TopicTraceSelection = { count: number } & (
  | { traceIds: string[] }
  | {
      selection: Extract<
        RouterInputs["topics"]["trigger"],
        { selection: unknown }
      >["selection"];
    }
);
export function useTopicTraceSelector({
  projectId,
  enabled,
  filterOptionsEnabled,
}: {
  projectId: string;
  enabled: boolean;
  filterOptionsEnabled: boolean;
}) {
  const [mode, setMode] = useState("filters");
  const [filterMode, setFilterMode] = useState<"builder" | "query">("builder");
  const [filter, setFilter] = useState<FilterState>([]);
  const [timeWindow, setTimeWindow] = useState("7");
  const [range, setRange] = useState(() => relativeTopicTimeRange(7));
  const [limit, setLimit] = useState(String(TOPICS_BACKFILL_TRACE_LIMIT));
  const [sampling, setSampling] = useState<"random" | "latest">("random");
  const [paste, setPaste] = useState("");
  // The preview loads as soon as the criteria are valid; no explicit click needed.
  const [request, setRequest] = useState<PreviewInput | null>(() => ({
    projectId,
    filter: [],
    ...range,
    limit: TOPICS_BACKFILL_TRACE_LIMIT,
    sampling: "random",
    seed: crypto.randomUUID(),
  }));
  const [excluded, setExcluded] = useState<string[]>([]);
  const validLimit =
    Number.isSafeInteger(Number(limit)) &&
    Number(limit) >= 1 &&
    Number(limit) <= TOPICS_BACKFILL_TRACE_LIMIT;
  const validRange = isValidTopicTimeRange(range);
  const refreshPreview = () => {
    setExcluded([]);
    setRequest(
      mode === "filters" && validLimit && validRange
        ? {
            projectId,
            filter,
            ...range,
            limit: Number(limit),
            sampling,
            seed: crypto.randomUUID(),
          }
        : null,
    );
  };
  // Runs after the re-render, so it reads the latest criteria; typing doesn't query per keystroke.
  const refreshPreviewSoon = useDebounce(refreshPreview, 500, false);
  const invalidatePreview = () => {
    setRequest(null);
    setExcluded([]);
    refreshPreviewSoon();
  };
  const reset = (filter: FilterState = []) => {
    setMode("filters");
    setFilterMode("builder");
    setFilter(filter);
    setTimeWindow("7");
    setRange(relativeTopicTimeRange(7));
    setPaste("");
    invalidatePreview();
  };
  const preview = api.topics.previewTraces.useQuery(
    request ?? {
      projectId,
      filter: [],
      ...range,
      limit: TOPICS_BACKFILL_TRACE_LIMIT,
      sampling: "random",
      seed: "unselected",
    },
    {
      enabled: (query) =>
        enabled &&
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
      if (pastedIds.length > TOPICS_BACKFILL_TRACE_LIMIT) {
        throw new Error(
          `Select at most ${TOPICS_BACKFILL_TRACE_LIMIT.toLocaleString()} traces per run.`,
        );
      }
    } catch (error) {
      pastedIds = null;
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
    enabled:
      enabled && filterOptionsEnabled && mode === "filters" && validRange,
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
  ).flatMap((column) => {
    if (column.id === "isRootObservation") return [];
    return column.id === "experimentId" && column.type === "stringOptions"
      ? [{ ...column, options: options.filterOptions?.experimentId ?? [] }]
      : [column];
  });
  const handleModeChange = (value: string) => {
    setMode(value);
    invalidatePreview();
  };
  const handleFilterChange = (value: FilterState) => {
    setFilter(value);
    invalidatePreview();
  };
  const handleTimeWindowChange = (value: string) => {
    setTimeWindow(value);
    setRange(
      value === "custom"
        ? topicCalendarRange(topicCalendarDates(range))
        : relativeTopicTimeRange(Number(value)),
    );
    invalidatePreview();
  };
  const handleRangeChange: TopicTraceSelectorViewProps["onRangeChange"] = (
    value,
  ) => {
    setRange(value);
    invalidatePreview();
  };
  const handleLimitChange = (value: string) => {
    setLimit(value);
    invalidatePreview();
  };
  const handleSamplingChange: TopicTraceSelectorViewProps["onSamplingChange"] =
    (value) => {
      setSampling(value);
      invalidatePreview();
    };
  let previewState: TopicTraceSelectorViewProps["preview"] = { status: "idle" };
  if (ready && request) {
    previewState = { status: "ready", data: ready, seed: request.seed };
  } else if (request && preview.isFetching) {
    previewState = { status: "loading" };
  } else if (request && preview.error) {
    previewState = { status: "error", message: preview.error.message };
  }
  const controls = (
    <TopicTraceSelectorView
      projectId={projectId}
      mode={mode}
      onModeChange={handleModeChange}
      filterMode={filterMode}
      onFilterModeChange={setFilterMode}
      filter={filter}
      onFilterChange={handleFilterChange}
      timeWindow={timeWindow}
      range={range}
      onTimeWindowChange={handleTimeWindowChange}
      onRangeChange={handleRangeChange}
      limit={limit}
      onLimitChange={handleLimitChange}
      sampling={sampling}
      onSamplingChange={handleSamplingChange}
      paste={paste}
      onPasteChange={setPaste}
      pastedCount={pastedIds?.length ?? null}
      pasteError={pasteError}
      preview={previewState}
      onPreview={refreshPreview}
      excluded={excluded}
      onExcludedChange={setExcluded}
      builderColumns={builderColumns}
      observed={observed}
      onRequestColumns={options.requestColumns}
      erroredColumns={options.erroredColumns}
    />
  );
  let selection: TopicTraceSelection | null = null;
  if (mode === "paste") {
    if (pastedIds) selection = { traceIds: pastedIds, count: pastedIds.length };
  } else if (request && selectedCount > 0) {
    selection = {
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
    };
  }
  const criteria: FilterState | null =
    mode === "filters" && validLimit ? filter : null;
  return {
    selection,
    criteria,
    controls,
    reset,
  };
}
