import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Asterisk,
  Check,
  ChevronDown,
  CircleDot,
  ExternalLink,
  EyeOff,
  FlaskConical,
  ListTree,
  Sparkles,
  Wrench,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { cn } from "@/src/utils/tailwind";
import { Slider } from "@/src/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { useObservedMetadataPaths } from "@/src/features/search-bar/hooks/useObservedMetadata";
import { withMetadataPathOptions } from "@/src/features/search-bar/lib/metadata-paths";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { type ScopeTargetObject } from "@/src/features/evals/v2/lib/scopeTarget";
import { api } from "@/src/utils/api";
import { type FilterState, type TracingSearchType } from "@langfuse/shared";

/**
 * Observations produced by evaluation runs themselves (LLM judges, prompt
 * experiments, SDK experiment runs) — excluded by default so evaluators don't
 * score evaluation output. Environments Langfuse itself writes into carry a
 * `langfuse-` prefix; SDK experiment runs use `sdk-experiment`. Contains
 * instead of an enumerated none-of keeps the search-bar pill short
 * (`-env:*langfuse-*`) — the contract has no negated starts-with.
 */
const EVALUATION_OBSERVATION_EXCLUSION_FILTERS: FilterState = [
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
const EXAMPLE_FILTERS: {
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

// Same icons as the old evaluator setup's target toggle.
export const TARGET_OBJECT_OPTIONS: {
  value: ScopeTargetObject;
  label: string;
  icon: typeof CircleDot;
}[] = [
  { value: "event", label: "Observations", icon: CircleDot },
  { value: "experiment", label: "Experiments", icon: FlaskConical },
];

export function targetObjectLabel(targetObject: string): string {
  return (
    TARGET_OBJECT_OPTIONS.find((o) => o.value === targetObject)?.label ??
    targetObject
  );
}

export type RunScopeFormState = {
  mode: "new" | "existing";
  runScopeId: string | null;
  targetObject: ScopeTargetObject;
  filterState: FilterState;
  sampling: number;
  /** User-chosen name for a new scope; null = auto-generate from the filter. */
  name: string | null;
};

export const DEFAULT_RUN_SCOPE_STATE: RunScopeFormState = {
  mode: "new",
  runScopeId: null,
  targetObject: "event",
  // Evaluation output is excluded by default; the pills are editable, so
  // scoring it stays one deletion away.
  filterState: [...EVALUATION_OBSERVATION_EXCLUSION_FILTERS],
  sampling: 1,
  name: null,
};

function formatFilterValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (value instanceof Date) return value.toLocaleDateString();
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Auto-generated run scope name: a human summary of the filter, made unique
 * against the already-loaded scopes by appending " 2", " 3", ...
 */
export function generateRunScopeName({
  filter,
  targetObject,
  existingNames,
}: {
  filter: FilterState;
  targetObject: ScopeTargetObject;
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

function ScopeFilterSearchBar({
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
      store={store}
      commit={commit}
      observed={observed}
      onRequestColumns={requestColumns}
      onApplyFilters={applyFilters}
      className="p-0"
      savedQueries={savedQueries}
      onPickSavedQuery={onPickSavedQuery}
    />
  );
}

export function RunScopeSection({
  projectId,
  scope,
  onChange,
}: {
  projectId: string;
  scope: RunScopeFormState;
  onChange: (next: RunScopeFormState) => void;
}) {
  const existingScopes = api.evalsV2.runScopes.useQuery({ projectId });
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Scopes saved by the earlier trace-based prototype can't drive this
  // observation-centric form — hide them from the reuse menu.
  const reusableScopes = existingScopes.data?.filter(
    (s) => s.targetObject !== "trace",
  );

  const selectedScope =
    scope.mode === "existing"
      ? existingScopes.data?.find((s) => s.id === scope.runScopeId)
      : undefined;

  const generatedName = useMemo(
    () =>
      generateRunScopeName({
        filter: scope.filterState,
        targetObject: scope.targetObject,
        existingNames: (existingScopes.data ?? []).map((s) => s.name),
      }),
    [scope.filterState, scope.targetObject, existingScopes.data],
  );

  const isNewScope = !(scope.mode === "existing" && selectedScope);
  const scopeStatusLabel =
    !isNewScope && selectedScope
      ? `${selectedScope.name} · ${selectedScope._count.jobConfigurations} evaluator${selectedScope._count.jobConfigurations === 1 ? "" : "s"}`
      : scope.name?.trim() || generatedName;

  // Shared scopes are immutable from this form: editing one forks it into a
  // new scope so the other evaluators keep their behavior. Remembers the
  // origin for a hint until the user picks a scope again.
  const [forkedFromName, setForkedFromName] = useState<string | null>(null);

  const changeWithFork = (next: Partial<RunScopeFormState>) => {
    if (scope.mode === "existing") {
      // A value-identical write is a commit echo (e.g. the search bar
      // re-committing on blur right after a shared filter was applied), not a
      // user edit — forking on it would silently detach the shared filter.
      const isNoOp =
        (next.filterState === undefined ||
          JSON.stringify(next.filterState) ===
            JSON.stringify(scope.filterState)) &&
        (next.sampling === undefined || next.sampling === scope.sampling) &&
        (next.targetObject === undefined ||
          next.targetObject === scope.targetObject);
      if (isNoOp) return;
      setForkedFromName(selectedScope?.name ?? null);
      onChange({
        ...scope,
        ...next,
        mode: "new",
        runScopeId: null,
        name: null,
      });
      return;
    }
    onChange({ ...scope, ...next });
  };

  // Selecting a shared filter REPLACES the whole scope state (in contrast to
  // the example chips, which merge). Shared by the "Reuse filter" menu and
  // the search bar's shared-filters section.
  const selectSharedScope = (id: string) => {
    const s = reusableScopes?.find((candidate) => candidate.id === id);
    if (!s) return;
    setForkedFromName(null);
    onChange({
      mode: "existing",
      runScopeId: s.id,
      targetObject: s.targetObject as ScopeTargetObject,
      filterState: s.filter,
      sampling: s.sampling,
      name: null,
    });
  };

  // Detail: the names of the evaluators using the filter, "a, b and x more"
  // past two. The query returns the first 5 names; `_count` has the true total.
  const evaluatorNamesDetail = (s: {
    jobConfigurations: { scoreName: string }[];
    _count: { jobConfigurations: number };
  }): string => {
    const total = s._count.jobConfigurations;
    if (total === 0) return "no evaluators yet";
    const names = s.jobConfigurations.map((jc) => jc.scoreName);
    const shown = names.slice(0, 2).join(", ");
    const rest = total - Math.min(2, names.length);
    return rest > 0 ? `${shown} and ${rest} more` : shown;
  };

  const sharedFilterSection =
    (reusableScopes?.length ?? 0) > 0
      ? {
          title: "Shared filters",
          items: (reusableScopes ?? []).map((s) => ({
            id: s.id,
            label: s.name,
            detail: evaluatorNamesDetail(s),
          })),
        }
      : undefined;

  /**
   * GDrive-style save status next to the section label: an icon-only
   * indicator (new vs. shared scope — deliberately no third "forked" state,
   * editing a shared scope simply flips back to "new"), with the full story
   * and the rename affordance behind a click.
   */
  const scopeStatus = (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground h-6 gap-1 px-1.5 text-xs font-normal"
          title={
            isNewScope
              ? `Saving creates shared filter "${scopeStatusLabel}"`
              : `Re-uses shared filter ${scopeStatusLabel}`
          }
        >
          {isNewScope ? (
            // Unsaved-state asterisk (the editor "dirty" marker), not a
            // favorite star: this scope does not exist yet.
            <Asterisk className="h-4 w-4 stroke-amber-500" strokeWidth={2.5} />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {isNewScope
            ? "New filter will be saved for reuse"
            : "Re-uses shared filter"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-2">
        {isNewScope ? (
          <>
            <p className="text-sm font-medium">New shared filter</p>
            <p className="text-muted-foreground text-sm">
              Saving makes this filter reusable, so other evaluators can pick it
              up later.
            </p>
            <Input
              placeholder={generatedName}
              value={scope.name ?? ""}
              onChange={(event) =>
                onChange({
                  ...scope,
                  name: event.target.value === "" ? null : event.target.value,
                })
              }
            />
          </>
        ) : (
          <>
            <p className="text-sm font-medium">{selectedScope?.name}</p>
            <p className="text-muted-foreground text-sm">
              {`Shared filter — ${selectedScope?._count.jobConfigurations ?? 0} evaluator${(selectedScope?._count.jobConfigurations ?? 0) === 1 ? " stays" : "s stay"} in sync. Editing it starts a new filter; the original keeps its evaluators.`}
            </p>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setForkedFromName(null);
                  onChange({ ...scope, mode: "new", runScopeId: null });
                }}
              >
                Start a new filter
              </Button>
              <Link
                href={`/project/${projectId}/evals/v2/scopes`}
                target="_blank"
                rel="noopener"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
              >
                <ExternalLink className="h-3 w-3" />
                Manage shared filters
              </Link>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Data source</Label>
        <p className="text-muted-foreground text-sm">
          What the evaluator runs on: individual observations (spans,
          generations, tool calls) or experiment runs.
        </p>
        <Tabs
          value={scope.targetObject}
          onValueChange={(value) =>
            onChange({ ...scope, targetObject: value as ScopeTargetObject })
          }
        >
          <TabsList>
            {TARGET_OBJECT_OPTIONS.map((option) => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                disabled={scope.mode === "existing"}
                className="gap-1.5"
              >
                <option.icon className="h-3.5 w-3.5" />
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Label>
            Filter {targetObjectLabel(scope.targetObject).toLowerCase()}
          </Label>
          {scopeStatus}
        </div>
        <p className="text-muted-foreground text-sm">
          {`Narrow down which ${targetObjectLabel(scope.targetObject).toLowerCase()} get evaluated — leave empty to evaluate everything, or reuse a shared filter to keep evaluators in sync.`}
        </p>
        <ScopeFilterSearchBar
          projectId={projectId}
          filterState={scope.filterState}
          setFilterState={(filterState) => changeWithFork({ filterState })}
          savedQueries={sharedFilterSection}
          onPickSavedQuery={selectSharedScope}
        />
        {scope.mode === "new" && forkedFromName && (
          <p className="text-muted-foreground text-sm">
            {`Changed from "${forkedFromName}" — saving as a new filter, the other evaluators keep the shared one.`}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {EXAMPLE_FILTERS.map((example) => (
            <Button
              key={example.label}
              type="button"
              variant="outline"
              onClick={() =>
                changeWithFork({
                  filterState: mergeExampleFilters(
                    scope.filterState,
                    example.filters,
                  ),
                })
              }
            >
              <example.icon className="mr-1.5 h-3.5 w-3.5" />
              {example.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <button
          type="button"
          className="flex w-fit items-center gap-1 text-sm font-medium"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((prev) => !prev)}
        >
          <ChevronDown
            className={cn(
              "text-muted-foreground h-4 w-4 transition-transform",
              !advancedOpen && "-rotate-90",
            )}
          />
          Advanced
        </button>

        {advancedOpen && scope.mode === "new" && (
          <div className="flex flex-col gap-2">
            <Label>Shared filter name</Label>
            <p className="text-muted-foreground text-sm">
              The filter is saved for reuse under this name — leave empty to
              name it after its contents.
            </p>
            <Input
              className="max-w-md"
              placeholder={generatedName}
              value={scope.name ?? ""}
              onChange={(event) =>
                onChange({
                  ...scope,
                  name: event.target.value === "" ? null : event.target.value,
                })
              }
            />
          </div>
        )}

        {advancedOpen && (
          <div className="flex flex-col gap-2">
            <Label>Sampling</Label>
            <p className="text-muted-foreground text-sm">
              The share of matching items that gets evaluated — lower it to
              trade coverage for cost.
            </p>
            <div className="flex items-center gap-3">
              <div className="w-48">
                <Slider
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={[scope.sampling]}
                  onValueChange={(value) =>
                    changeWithFork({ sampling: value[0] ?? 1 })
                  }
                />
              </div>
              <span className="w-10 text-right font-mono text-sm">
                {Math.round(scope.sampling * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
