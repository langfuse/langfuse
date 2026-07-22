import { useMemo, useState } from "react";
import { EyeOff, FlaskConical, ListTree, Sparkles, Wrench } from "lucide-react";

import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { useObservedMetadataPaths } from "@/src/features/search-bar/hooks/useObservedMetadata";
import { withMetadataPathOptions } from "@/src/features/search-bar/lib/metadata-paths";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { type EvaluationRuleObject } from "@/src/features/evals/v2/lib/evaluationRuleObject";
import { type FilterState, type TracingSearchType } from "@langfuse/shared";

/**
 * Observations produced by evaluation runs themselves (LLM judges, prompt
 * experiments, SDK experiment runs) — excluded by default so evaluators don't
 * score evaluation output. Environments Langfuse itself writes into carry a
 * `langfuse-` prefix; SDK experiment runs use `sdk-experiment`. Contains
 * instead of an enumerated none-of keeps the search-bar pill short
 * (`-env:*langfuse-*`) — the contract has no negated starts-with.
 */
export const EVALUATION_OBSERVATION_EXCLUSION_FILTERS: FilterState = [
  {
    column: "environment",
    type: "string",
    operator: "does not contain",
    value: "langfuse-",
  },
  {
    column: "environment",
    type: "stringOptions",
    operator: "none of",
    value: ["sdk-experiment"],
  },
];

/**
 * One-click example filters (tracing-view style chips) that merge into the
 * current filter (see mergeExampleFilters); the search bar re-derives them as
 * editable pills. Shapes match the system table-view presets.
 */
export const EXAMPLE_FILTERS: {
  label: string;
  icon: typeof ListTree;
  filters: FilterState;
}[] = [
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
    ],
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
    ],
  },
  {
    label: "Experiments",
    icon: FlaskConical,
    filters: [
      {
        column: "experimentId",
        type: "null",
        operator: "is not null",
        value: "",
      },
    ],
  },
  {
    label: "Tools",
    icon: Wrench,
    filters: [
      {
        column: "toolCalls",
        type: "number",
        operator: ">",
        value: 0,
      },
    ],
  },
  {
    label: "Exclude evaluations and experiments",
    icon: EyeOff,
    filters: EVALUATION_OBSERVATION_EXCLUSION_FILTERS,
  },
];

/**
 * Merge example-chip conditions into the current filter instead of replacing
 * it. A condition with the same column+type+operator is treated as already
 * present: array values are unioned (a second AND'ed `type any of [...]`
 * would contradict the first), scalar values are kept as they are.
 */
export function mergeExampleFilters(
  current: FilterState,
  additions: FilterState,
): FilterState {
  const next = [...current];
  for (const addition of additions) {
    const existingIndex = next.findIndex(
      (f) =>
        f.column === addition.column &&
        f.type === addition.type &&
        f.operator === addition.operator,
    );
    if (existingIndex === -1) {
      next.push(addition);
      continue;
    }
    const existing = next[existingIndex];
    if (Array.isArray(existing.value) && Array.isArray(addition.value)) {
      const merged = Array.from(
        new Set([
          ...(existing.value as string[]),
          ...(addition.value as string[]),
        ]),
      );
      next[existingIndex] = { ...existing, value: merged } as typeof existing;
    }
  }
  return next;
}

function formatFilterValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value instanceof Date) return value.toLocaleDateString();
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Auto-generated evaluation rule name: a human summary of the filter, made unique
 * against the already-loaded rules by appending " 2", " 3", ...
 */
export function generateEvaluationRuleName({
  filter,
  targetObject,
  existingNames,
}: {
  filter: FilterState;
  targetObject: EvaluationRuleObject;
  existingNames: string[];
}): string {
  let base: string;
  const isDefaultExclusionOnly =
    JSON.stringify(filter) ===
    JSON.stringify(EVALUATION_OBSERVATION_EXCLUSION_FILTERS);
  if (
    filter.length === 0 ||
    (isDefaultExclusionOnly && targetObject === "event")
  ) {
    base =
      targetObject === "event"
        ? isDefaultExclusionOnly
          ? "All observations excl. evaluations"
          : "All observations"
        : "All experiments";
  } else {
    const first = filter[0];
    const value = formatFilterValue(first.value);
    base = [first.column, first.operator, value]
      .filter((part) => part.length > 0)
      .join(" ");
    if (filter.length > 1) base += ` + ${filter.length - 1} more`;
  }

  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  if (!taken.has(base.trim().toLowerCase())) return base;
  let suffix = 2;
  while (taken.has(`${base} ${suffix}`.toLowerCase())) suffix += 1;
  return `${base} ${suffix}`;
}

export function RuleFilterSearchBar({
  projectId,
  filterState,
  setFilterState,
  savedQueries,
  onPickSavedQuery,
}: {
  projectId: string;
  filterState: FilterState;
  setFilterState: (filters: FilterState) => void;
  /** Shared filters shown as an empty-bar autocomplete section. */
  savedQueries?: {
    title: string;
    items: { id: string; label: string; detail?: string }[];
  };
  onPickSavedQuery?: (id: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<TracingSearchType[]>([]);

  // Facet options are scoped to a recent window; stable identity so the
  // filter-option queries never refetch on re-render.
  const [optionsFilterState] = useState<FilterState>(() => [
    {
      column: "Start Time",
      type: "datetime",
      operator: ">=",
      value: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  ]);

  const { filterOptions, isFilterOptionsPending, requestColumns } =
    useEventsFilterOptions({
      projectId,
      oldFilterState: optionsFilterState,
      lazy: true,
    });

  const observedMetadataPaths = useObservedMetadataPaths(projectId, true);

  const observed = useMemo(
    () =>
      withMetadataPathOptions(
        toObservedOptions(filterOptions, isFilterOptionsPending),
        observedMetadataPaths,
      ),
    [filterOptions, isFilterOptionsPending, observedMetadataPaths],
  );

  const { store, commit, applyFilters } = useEventsSearchBar({
    projectId,
    tableName: "observations",
    enabled: true,
    filterState,
    searchQuery,
    searchType,
    observed,
    setFilterState,
    setSearchQuery,
    setSearchType,
  });

  return (
    <EventsSearchBarRow
      projectId={projectId}
      tableName="observations"
      store={store}
      commit={commit}
      observed={observed}
      onRequestColumns={requestColumns}
      onApplyFilters={applyFilters}
      className="p-0"
      composerSurfaceClassName="px-0"
      savedQueries={savedQueries}
      onPickSavedQuery={onPickSavedQuery}
    />
  );
}
