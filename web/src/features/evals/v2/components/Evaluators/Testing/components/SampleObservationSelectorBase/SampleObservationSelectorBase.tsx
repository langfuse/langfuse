/* eslint-disable no-nested-ternary */
/* eslint-disable @repo/no-style-props */
import { useCallback, useEffect, useMemo, useState, type UIEvent } from "react";
import {
  CircleAlert,
  Database,
  FlaskConical,
  ListTree,
  Sparkles,
  Wrench,
} from "@langfuse/icons";
import {
  TopicsTargetObject,
  type FilterState,
  type TimeFilter,
  type TracingSearchType,
} from "@langfuse/shared";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/DataTableColumnVisibilityFilter";
import {
  resolveRowHeightRendering,
  useRowHeightLocalStorage,
} from "@/src/components/table/data-table-row-height-switch";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/design-system/Button/Button";
import { TextActionButton } from "@/src/components/TextActionButton/TextActionButton";
import { Skeleton } from "@/src/components/ui/skeleton";
import useLocalStorage from "@/src/components/useLocalStorage";
import { buildAiContext } from "@/src/features/search-bar/lib/ai-context";
import {
  EVENTS_FIELD_REGISTRY,
  type FieldRegistry,
} from "@/src/features/search-bar/lib/fields";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";

import { observedScoreNamesFromOptions } from "@/src/features/search-bar/lib/observed-options";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { default as useColumnOrder } from "@/src/features/column-visibility/hooks/useColumnOrder";
import { default as useColumnVisibility } from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { api, sendAsPostOption, type RouterOutputs } from "@/src/utils/api";
import type { AbsoluteTimeRange } from "@/src/utils/date-range-utils";
import { SectionHeader } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SectionHeader/SectionHeader";
import { EVALUATOR_FILTER_EXPERIENCE_STORAGE_KEY } from "@/src/features/evals/v2/constants/evaluatorFilterExperience";
import { EvaluatorFilterModeDropdown } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/EvaluatorFilterModeDropdown";
import { ObservationFilterBuilder } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/components/ObservationFilterBuilder/ObservationFilterBuilder";
import { buildSampleQueryFilters } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/fns/buildSampleQueryFilters";
import { dedupeObservationPages } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/fns/dedupeObservations";
import { toggleExampleFilters } from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/fns/toggleExampleFilters";
import {
  type MapSampleObservedOptions,
  useSampleObservationFilterOptions,
} from "@/src/features/evals/v2/components/Evaluators/Testing/components/SampleObservationSelectorBase/hooks/useSampleObservationFilterOptions";
import { EvaluatorSampleDetail } from "@/src/features/evals/v2/components/Evaluators/Testing/components/EvaluatorSampleDetail/EvaluatorSampleDetail";
import { orderSamplesByTrace } from "@/src/features/evals/v2/fns/evaluatorTesting/orderSamplesByTrace";
import { useEvaluatorSampleTraceCount } from "@/src/features/evals/v2/hooks/useEvaluatorSampleTraceCount";
import { useEvaluatorTraceMatches } from "@/src/features/evals/v2/hooks/useEvaluatorTraceMatches";
import { useReusableRuleFilterPresets } from "@/src/features/evals/v2/hooks/useReusableRuleFilterPresets";
import type { EvaluatorFilterExperience } from "@/src/features/evals/v2/types/evaluatorFilterExperience";
import type { RuleTargetObject } from "@/src/features/evals/v2/types/rules";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export type SampleObservation =
  RouterOutputs["events"]["all"]["observations"][number];

const PAGE_SIZE = 25;
/** Trace samples keep loading observation pages until this many traces show up. */
const MIN_SAMPLE_TRACES = 5;
const MAX_TRACE_SAMPLE_PAGES = 8;
const NO_SAMPLES: SampleObservation[] = [];

const EXAMPLES = [
  {
    label: "Root spans",
    icon: ListTree,
    filters: [
      {
        column: "isRootObservation",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ] satisfies FilterState,
  },
  {
    label: "Generations",
    icon: Sparkles,
    filters: [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["GENERATION"],
      },
    ] satisfies FilterState,
  },
  {
    label: "Experiments",
    icon: FlaskConical,
    filters: [
      {
        column: "isExperimentItemRootSpan",
        type: "boolean",
        operator: "=",
        value: true,
      },
    ] satisfies FilterState,
  },
  {
    label: "Tools",
    icon: Wrench,
    filters: [
      {
        column: "type",
        type: "stringOptions",
        operator: "any of",
        value: ["TOOL"],
      },
    ] satisfies FilterState,
  },
] as const;

const TRACE_EXAMPLES = [
  EXAMPLES.find((example) => example.label === "Experiments")!,
  {
    label: "Errors",
    icon: CircleAlert,
    filters: [
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["ERROR"],
      },
    ] satisfies FilterState,
  },
];

function timeFilters(range: AbsoluteTimeRange | null): FilterState {
  if (!range) return [];
  return [
    {
      column: "startTime",
      type: "datetime",
      operator: ">=",
      value: range.from,
    },
    ...(range.to
      ? ([
          {
            column: "startTime",
            type: "datetime",
            operator: "<",
            value: range.to,
          },
        ] satisfies FilterState)
      : []),
  ];
}

export type SampleObservationSelectorBaseProps = {
  projectId: string;
  timeRange: AbsoluteTimeRange | null;
  filterState: FilterState;
  onFilterStateChange: (filters: FilterState) => void;
  previewFilters: FilterState;
  tableName: string;
  registry: FieldRegistry | undefined;
  selectedObservationId: string | null;
  onSelect: (observation: SampleObservation | null) => void;
  onOpenTrace: (observation: SampleObservation) => void;
  leadingColumns: LangfuseColumnDef<SampleObservation>[];
  resolveSelection: (
    observations: SampleObservation[],
    selectedObservationId: string | null,
  ) => SampleObservation | null | undefined;
  getRowClassName: ((observation: SampleObservation) => string) | undefined;
  filterTitle?: string;
  filterDescription: string;
  filterTooltip: string;
  matchingDescription: string;
  matchingTooltip: string;
  formatCount: (count: number) => string;
  mapObservedOptions: MapSampleObservedOptions;
  /** "detail" shows one sample in the trace view instead of the table. */
  samplePresentation?: "table" | "detail";
  /** Trace targets keep the filter and list no matching observations. */
  targetObject: RuleTargetObject;
};

/** First matching observation per trace, in match order. */
function matchingTraces(observations: SampleObservation[]) {
  const seen = new Set<string>();
  return observations.filter((observation) => {
    if (!observation.traceId || seen.has(observation.traceId)) return false;
    seen.add(observation.traceId);
    return true;
  });
}

function selectorLayoutClassName(showTraceDetail: boolean) {
  if (showTraceDetail) {
    return "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden";
  }
  return "flex shrink-0 flex-col gap-6";
}

export function SampleObservationSelectorBase(
  props: SampleObservationSelectorBaseProps,
) {
  const {
    projectId,
    timeRange,
    filterState,
    onFilterStateChange,
    previewFilters,
    tableName,
    registry,
    selectedObservationId,
    onSelect,
    onOpenTrace,
    leadingColumns,
    resolveSelection,
    getRowClassName,
    filterTitle = "Filter observations",
    filterDescription,
    filterTooltip,
    matchingDescription,
    matchingTooltip,
    formatCount,
    mapObservedOptions,
    samplePresentation = "table",
    targetObject,
  } = props;
  const showTraceDetail = samplePresentation === "detail";
  const isTraceTarget = targetObject === TopicsTargetObject;
  const activeRegistry = registry ?? EVENTS_FIELD_REGISTRY;
  const [filterMode, setFilterMode] =
    useLocalStorage<EvaluatorFilterExperience>(
      EVALUATOR_FILTER_EXPERIENCE_STORAGE_KEY,
      "query",
    );
  const datasets = api.datasets.allDatasetMeta.useQuery(
    { projectId },
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );
  const datasetOptions = useMemo(() => datasets.data ?? [], [datasets.data]);
  const examples = useMemo(() => {
    if (isTraceTarget) return TRACE_EXAMPLES;
    const firstDataset = datasetOptions[0];
    return firstDataset
      ? [
          ...EXAMPLES,
          {
            label: "Datasets",
            icon: Database,
            filters: [
              {
                column: "experimentDatasetId",
                type: "stringOptions",
                operator: "any of",
                value: [firstDataset.id],
              },
            ] satisfies FilterState,
          },
        ]
      : EXAMPLES;
  }, [datasetOptions, isTraceTarget]);
  const setFilters = (
    next: FilterState | ((current: FilterState) => FilterState),
  ) => {
    const resolved = typeof next === "function" ? next(filterState) : next;
    onFilterStateChange(resolved);
  };
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<TracingSearchType[]>([]);
  const [rowHeight] = useRowHeightLocalStorage(
    `${tableName}-${projectId}-rowHeight`,
    "s",
  );
  const startTimeFilter = useMemo<TimeFilter[]>(
    () =>
      timeFilters(timeRange).filter(
        (filter): filter is TimeFilter => filter.column === "startTime",
      ),
    [timeRange],
  );
  const effectiveFilters = useMemo(
    () => buildSampleQueryFilters(previewFilters, timeFilters(timeRange)),
    [previewFilters, timeRange],
  );
  const refiningFilter = useMemo(
    () => buildSampleQueryFilters(previewFilters),
    [previewFilters],
  );
  const options = useSampleObservationFilterOptions({
    projectId,
    startTimeFilter,
    refiningFilter,
    filterMode,
    activeRegistry,
    datasetOptions,
    mapObservedOptions,
  });
  const { searchRegistry, observed, builderColumns, queryOnlyColumnIds } =
    options;
  const reusableRuleFilters = useReusableRuleFilterPresets(
    projectId,
    searchRegistry,
  );
  const capture = usePostHogClientCapture();
  const onQueryPresetPick = useCallback(
    (presetId: string) => {
      const preset = reusableRuleFilters.presets.find(
        (candidate) => candidate.id === presetId,
      );
      if (!preset) return;
      capture("evaluation_rules:filter_reused", {
        tableName,
        evaluatorCount: preset.evaluatorCount,
        filterCount: preset.filterCount,
        replacedFilterCount: filterState.length,
        isV4: true,
      });
    },
    [capture, filterState.length, reusableRuleFilters.presets, tableName],
  );
  const search = useEventsSearchBar({
    projectId,
    tableName,
    enabled: !datasets.isPending,
    filterState,
    searchQuery,
    searchType,
    observed,
    setFilterState: (next) => {
      setFilters(next);
    },
    setSearchQuery: (next) => {
      setSearchQuery(next);
    },
    setSearchType: (next) => {
      setSearchType(next);
    },
    registry: searchRegistry,
  });
  // listCursor always reads in the events table's stable start_time DESC tuple
  // order, so it takes no orderBy.
  const listMatches = !isTraceTarget || showTraceDetail;
  const observationQuery = api.events.listCursor.useInfiniteQuery(
    {
      projectId,
      filter: effectiveFilters,
      searchQuery,
      searchType,
      limit: PAGE_SIZE,
    },
    {
      enabled: listMatches,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  const observationPages = useMemo(
    () =>
      dedupeObservationPages(
        observationQuery.data?.pages.map((page) => page.observations) ?? [],
      ),
    [observationQuery.data?.pages],
  );
  const matchingObservations = observationPages.flat();
  const observationIOPages = api.useQueries((t) =>
    observationPages
      .filter((page) => page.length > 0)
      .map((page) => {
        const observations = page.filter(
          (observation) =>
            observation.id && observation.traceId && observation.startTime,
        );
        const startTimes = observations.map((observation) =>
          observation.startTime.getTime(),
        );

        return t.events.batchIO(
          {
            projectId,
            observations: observations.map((observation) => ({
              id: observation.id,
              traceId: observation.traceId!,
            })),
            minStartTime: new Date(
              startTimes.length > 0 ? Math.min(...startTimes) : 0,
            ),
            maxStartTime: new Date(
              startTimes.length > 0 ? Math.max(...startTimes) : 0,
            ),
          },
          {
            ...sendAsPostOption,
            enabled:
              !showTraceDetail &&
              observationQuery.isSuccess &&
              observations.length > 0,
          },
        );
      }),
  );
  const observationIOById = useMemo(
    () =>
      new Map(
        observationIOPages
          .flatMap((page) => page.data ?? [])
          .map((io) => [io.id, io]),
      ),
    [observationIOPages],
  );
  const observationIOPending = observationIOPages.some(
    (page) => page.isPending,
  );
  const observationsPending = observationQuery.isPending;
  const observationsFetching = observationQuery.isFetchingNextPage;
  const observationsError = observationQuery.error;
  const aiDataContext = useMemo(
    () =>
      buildAiContext({
        observed,
        sampleMetadata: matchingObservations
          .slice(0, 30)
          .map((observation) => observation.metadata),
        resultCount: observationQuery.isSuccess
          ? matchingObservations.length
          : null,
        registry: searchRegistry,
      }),
    [
      searchRegistry,
      matchingObservations,
      observationQuery.isSuccess,
      observed,
    ],
  );
  const aiScoreNames = useMemo(
    () =>
      searchRegistry.scores
        ? observedScoreNamesFromOptions(observed)
        : undefined,
    [searchRegistry, observed],
  );
  const selectionToReconcile = observationQuery.isSuccess
    ? resolveSelection(matchingObservations, selectedObservationId)
    : undefined;
  const reconcileSelection =
    selectionToReconcile !== undefined
      ? (element: HTMLDivElement | null) => {
          // Commit fresh query results through the existing selection owner without a data-sync effect.
          if (element) onSelect(selectionToReconcile);
        }
      : undefined;
  const querySettled =
    observationQuery.isSuccess && !observationQuery.isFetching;
  // Matches of traces already stepped through stay in the list, so stepping back retraces them.
  const matchScope = JSON.stringify([
    effectiveFilters,
    searchQuery,
    searchType,
  ]);
  const [visitedMatches, setVisitedMatches] = useState({
    scope: matchScope,
    samples: NO_SAMPLES,
  });
  const keptMatches =
    visitedMatches.scope === matchScope ? visitedMatches.samples : NO_SAMPLES;
  // A sample picked in the trace tree may sit outside the loaded pages.
  const isSelected = (observation: SampleObservation) =>
    observation.id === selectedObservationId;
  const knownSample =
    matchingObservations.find(isSelected) ?? keptMatches.find(isSelected);
  // Without a known sample, the next one comes from the first loaded trace.
  const sampleTraceId =
    !isTraceTarget && showTraceDetail
      ? (knownSample?.traceId ?? matchingObservations[0]?.traceId ?? null)
      : null;
  // Every match in the sample's trace, so each can be picked from the tree.
  const sampleTrace = useEvaluatorTraceMatches({
    projectId,
    filter: effectiveFilters,
    searchQuery,
    searchType,
    traceId: sampleTraceId,
  });
  // The next trace loads ahead, so stepping into it lands on its first match.
  const nextTraceId = useMemo(() => {
    if (sampleTraceId === null) return null;
    const traceIds = [
      ...new Set(
        observationPages.flat().flatMap(({ traceId }) => traceId ?? []),
      ),
    ];
    const index = traceIds.indexOf(sampleTraceId);
    return index === -1 ? null : (traceIds[index + 1] ?? null);
  }, [observationPages, sampleTraceId]);
  const nextTrace = useEvaluatorTraceMatches({
    projectId,
    filter: effectiveFilters,
    searchQuery,
    searchType,
    traceId: nextTraceId,
  });
  const traceMatches = useMemo(
    () => [...sampleTrace.samples, ...nextTrace.samples],
    [sampleTrace.samples, nextTrace.samples],
  );
  const detailObservations = useMemo(() => {
    const loaded = observationPages.flat();
    if (isTraceTarget) return matchingTraces(loaded);
    if (!showTraceDetail) return loaded;
    const seen = new Set(loaded.map((observation) => observation.id));
    const extras = [...keptMatches, ...traceMatches].filter((observation) => {
      if (seen.has(observation.id)) return false;
      seen.add(observation.id);
      return true;
    });
    return orderSamplesByTrace([...loaded, ...extras]);
  }, [
    isTraceTarget,
    showTraceDetail,
    observationPages,
    keptMatches,
    traceMatches,
  ]);
  // A first sample waits for every match of its trace, so none slots in ahead of it later.
  const detailSelectionToReconcile =
    querySettled && sampleTrace.isSettled
      ? resolveSelection(detailObservations, selectedObservationId)
      : undefined;
  const loadedPageCount = observationQuery.data?.pages.length ?? 0;
  const traceCount = useEvaluatorSampleTraceCount({
    projectId,
    filter: effectiveFilters,
    searchQuery,
    searchType,
    enabled: isTraceTarget && showTraceDetail,
  });
  // Pages may load unasked up to this many; each step by the user extends it.
  const [autoPageLimit, setAutoPageLimit] = useState(MAX_TRACE_SAMPLE_PAGES);
  const canAutoLoad =
    showTraceDetail &&
    querySettled &&
    observationQuery.hasNextPage &&
    loadedPageCount < autoPageLimit &&
    (traceCount === null || detailObservations.length < traceCount);
  const needsMoreTraces =
    isTraceTarget && detailObservations.length < MIN_SAMPLE_TRACES;
  const selectedSampleIndex = detailObservations.findIndex(
    (observation) => observation.id === selectedObservationId,
  );
  const isNearLastSample = selectedSampleIndex >= detailObservations.length - 2;
  const needsNextPage = canAutoLoad && (needsMoreTraces || isNearLastSample);
  const fetchNextObservationPage = observationQuery.fetchNextPage;
  useEffect(() => {
    if (!needsNextPage) return;
    fetchNextObservationPage().catch(() => undefined);
  }, [needsNextPage, loadedPageCount, fetchNextObservationPage]);

  const columns = useMemo<LangfuseColumnDef<SampleObservation>[]>(
    () => [
      ...leadingColumns,
      createDateTableColumn<SampleObservation>({
        accessorKey: "startTime",
        header: "Start time",
        size: 170,
        enableHiding: true,
      }),
      createTextTableColumn<SampleObservation>({
        accessorKey: "type",
        header: "Type",
        size: 110,
        enableHiding: true,
      }),
      createTextTableColumn<SampleObservation>({
        accessorKey: "name",
        header: "Name",
        size: 200,
        enableHiding: true,
        mapValue: (value) => value ?? "—",
      }),
      createTextTableColumn<SampleObservation>({
        accessorKey: "traceName",
        header: "Trace name",
        size: 180,
        enableHiding: true,
        defaultHidden: true,
        mapValue: (value) => value ?? "—",
      }),
      createIOTableColumn<SampleObservation>({
        accessorKey: "input",
        header: "Input",
        size: 300,
        enableHiding: true,
        getCell: (_value, { row }) => {
          const io = observationIOById.get(row.original.id);
          if (!io && observationIOPending) return { type: "loading" };
          return io?.input;
        },
        singleLine: resolveRowHeightRendering({ preset: rowHeight }).compact,
        enableExpandOnHover: true,
        variant: "input",
      }),
      createIOTableColumn<SampleObservation>({
        accessorKey: "output",
        header: "Output",
        size: 300,
        enableHiding: true,
        getCell: (_value, { row }) => {
          const io = observationIOById.get(row.original.id);
          if (!io && observationIOPending) return { type: "loading" };
          return io?.output;
        },
        singleLine: resolveRowHeightRendering({ preset: rowHeight }).compact,
        enableExpandOnHover: true,
        variant: "output",
      }),
      createIOTableColumn<SampleObservation>({
        accessorKey: "metadata",
        header: "Metadata",
        size: 300,
        enableHiding: true,
        getCell: (_value, { row }) => {
          const io = observationIOById.get(row.original.id);
          if (!io && observationIOPending) return { type: "loading" };
          return io?.metadata;
        },
        singleLine: resolveRowHeightRendering({ preset: rowHeight }).compact,
        enableExpandOnHover: true,
      }),
      createTextTableColumn<SampleObservation>({
        accessorKey: "environment",
        header: "Environment",
        size: 130,
        enableHiding: true,
        defaultHidden: true,
      }),
    ],
    [observationIOById, observationIOPending, leadingColumns, rowHeight],
  );
  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<SampleObservation>(
      `${tableName}-${projectId}-columns`,
      columns,
    );
  const [columnOrder, setColumnOrder] = useColumnOrder<SampleObservation>(
    `${tableName}-${projectId}-columnOrder`,
    columns,
  );

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (
      observationQuery.hasNextPage &&
      !observationsFetching &&
      element.scrollHeight - element.scrollTop - element.clientHeight < 80
    ) {
      observationQuery.fetchNextPage().catch(() => undefined);
    }
  };

  const filterModeControl = (
    <EvaluatorFilterModeDropdown
      mode={filterMode}
      size={showTraceDetail ? "sm" : "default"}
      onChange={(mode) => {
        if (mode === "builder" && searchQuery !== null) {
          search.applyFilters(filterState);
        }
        setFilterMode(mode);
      }}
    />
  );

  // The approximate observation count does not see a text search.
  const observationCount = searchQuery ? null : options.approxTotalCount;
  const sampleCount = isTraceTarget ? traceCount : observationCount;
  const sampleCountLabel =
    sampleCount !== null ? formatCount(sampleCount) : null;
  const sampleTitle = isTraceTarget
    ? "Matching traces"
    : "Matching observations";
  const presetButtons =
    filterMode === "query"
      ? examples.map((example) => {
          const toggle = () => {
            setFilters((current) =>
              toggleExampleFilters(current, [...example.filters]),
            );
          };
          return showTraceDetail ? (
            <TextActionButton
              key={example.label}
              text={example.label}
              icon={example.icon}
              tone="muted"
              onClick={toggle}
            />
          ) : (
            <Button
              key={example.label}
              type="button"
              variant="ghost"
              icon={example.icon}
              text={example.label}
              onClick={toggle}
            />
          );
        })
      : null;

  return (
    <div className={selectorLayoutClassName(showTraceDetail)}>
      <section
        aria-label={showTraceDetail ? filterTitle : undefined}
        className={
          showTraceDetail
            ? "bg-card flex shrink-0 flex-col gap-2 rounded-lg border px-2.5 py-2"
            : "flex flex-col gap-2"
        }
      >
        {showTraceDetail ? null : (
          <SectionHeader
            title={filterTitle}
            meta={null}
            description={filterDescription}
            tooltip={filterTooltip}
            trailing={filterModeControl}
          />
        )}
        {datasets.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : filterMode === "query" ? (
          <EventsSearchBarRow
            projectId={projectId}
            tableName={tableName}
            store={search.store}
            commit={search.commit}
            observed={observed}
            erroredColumns={options.erroredColumns}
            registry={searchRegistry}
            onApplyFilters={search.applyFilters}
            onRequestColumns={options.requestColumns}
            presetSections={reusableRuleFilters.sections}
            onQueryPresetPick={onQueryPresetPick}
            aiDataContext={aiDataContext}
            aiScoreNames={aiScoreNames}
            className="p-0"
          />
        ) : (
          <ObservationFilterBuilder
            columns={builderColumns}
            filterState={filterState}
            onChange={setFilters}
            queryOnlyColumnIds={queryOnlyColumnIds}
          />
        )}
        {showTraceDetail && (
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
              {presetButtons}
            </div>
            <div className="ml-auto shrink-0">{filterModeControl}</div>
          </div>
        )}
        {!showTraceDetail && presetButtons && (
          <div className="-ml-3 flex flex-wrap">{presetButtons}</div>
        )}
      </section>

      {showTraceDetail && (
        <section
          aria-label={sampleTitle}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div
            ref={
              detailSelectionToReconcile !== undefined
                ? (element) => {
                    // Commit fresh query results through the existing selection owner without a data-sync effect.
                    if (element) onSelect(detailSelectionToReconcile);
                  }
                : undefined
            }
            hidden
          />
          <EvaluatorSampleDetail
            projectId={projectId}
            targetObject={targetObject}
            title={sampleTitle}
            count={sampleCountLabel}
            observations={detailObservations}
            selectedObservationId={selectedObservationId}
            pending={observationsPending}
            onSelect={(observation) => {
              setAutoPageLimit(loadedPageCount + MAX_TRACE_SAMPLE_PAGES);
              const keptIds = new Set(keptMatches.map(({ id }) => id));
              setVisitedMatches({
                scope: matchScope,
                samples: [
                  ...keptMatches,
                  ...traceMatches.filter(({ id }) => !keptIds.has(id)),
                ],
              });
              onSelect(observation);
            }}
          />
        </section>
      )}
      {!showTraceDetail && !isTraceTarget && (
        <section className="flex min-h-0 flex-col gap-2">
          <SectionHeader
            title="Matching observations"
            meta={
              options.approxTotalCount !== null ? (
                <span className="text-muted-foreground shrink-0 text-sm">
                  {formatCount(options.approxTotalCount)}
                </span>
              ) : null
            }
            description={matchingDescription}
            tooltip={matchingTooltip}
            trailing={
              <DataTableColumnVisibilityFilter
                tableName="evaluator-sample-observations"
                isV4
                columns={columns}
                columnVisibility={columnVisibility}
                setColumnVisibility={setColumnVisibility}
                columnOrder={columnOrder}
                setColumnOrder={setColumnOrder}
                triggerSize="sm"
              />
            }
          />
          <div
            ref={reconcileSelection}
            className="flex h-64 min-h-0 flex-col overflow-hidden rounded-md border"
          >
            <DataTable
              tableName={tableName}
              columns={columns}
              data={
                observationsPending && matchingObservations.length === 0
                  ? { isLoading: true, isError: false }
                  : observationsError
                    ? {
                        isLoading: false,
                        isError: true,
                        error: observationsError.message,
                      }
                    : {
                        isLoading: false,
                        isError: false,
                        data: matchingObservations,
                      }
              }
              hidePagination
              onScroll={handleScroll}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
              rowHeight={rowHeight}
              onRowClick={onOpenTrace}
              getRowClassName={getRowClassName}
              noResultsMessage="No observations match the current filters and time range."
            />
          </div>
        </section>
      )}
    </div>
  );
}
