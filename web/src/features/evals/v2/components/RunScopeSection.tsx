import { useMemo, useState } from "react";
import {
  ChevronDown,
  FlaskConical,
  FolderCheck,
  ListTree,
  Sparkles,
} from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Label } from "@/src/components/ui/label";
import { cn } from "@/src/utils/tailwind";
import { Slider } from "@/src/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { useObservedMetadataPaths } from "@/src/features/search-bar/hooks/useObservedMetadata";
import { withMetadataPathOptions } from "@/src/features/search-bar/lib/metadata-paths";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { type ScopeTargetObject } from "@/src/features/evals/v2/lib/useSourceObject";
import { api } from "@/src/utils/api";
import { type FilterState, type TracingSearchType } from "@langfuse/shared";

/**
 * One-click example filters (tracing-view style chips) that replace the
 * current filter; the search bar re-derives them as editable pills. Shapes
 * match the system table-view presets.
 */
const EXAMPLE_FILTERS: {
  label: string;
  icon: typeof FlaskConical;
  filters: FilterState;
}[] = [
  {
    label: "Experiments",
    icon: FlaskConical,
    filters: [
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["langfuse-prompt-experiment", "sdk-experiment"],
      },
    ],
  },
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
];

export const TARGET_OBJECT_OPTIONS: {
  value: ScopeTargetObject;
  label: string;
}[] = [
  { value: "trace", label: "Traces" },
  { value: "event", label: "Observations" },
  { value: "experiment", label: "Experiments" },
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
};

export const DEFAULT_RUN_SCOPE_STATE: RunScopeFormState = {
  mode: "new",
  runScopeId: null,
  targetObject: "trace",
  filterState: [],
  sampling: 1,
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
  if (filter.length === 0) {
    base =
      targetObject === "trace"
        ? "All traces"
        : targetObject === "event"
          ? "All observations"
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
}: {
  projectId: string;
  filterState: FilterState;
  setFilterState: (filters: FilterState) => void;
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

  const selectedScope =
    scope.mode === "existing"
      ? existingScopes.data?.find((s) => s.id === scope.runScopeId)
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label>Data source</Label>
        <p className="text-muted-foreground text-sm">
          What the evaluator runs on: whole traces, individual observations
          within them, or experiment runs.
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
              >
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex flex-col gap-2">
        <Label>
          Filter {targetObjectLabel(scope.targetObject).toLowerCase()}
        </Label>
        <p className="text-muted-foreground text-sm">
          {`Narrow down which ${targetObjectLabel(scope.targetObject).toLowerCase()} get evaluated — leave empty to evaluate everything, or reuse a shared scope to keep evaluators in sync.`}
        </p>
        <ScopeFilterSearchBar
          projectId={projectId}
          filterState={scope.filterState}
          setFilterState={(filterState) => onChange({ ...scope, filterState })}
        />
        <div className="flex flex-wrap items-center gap-2">
          {EXAMPLE_FILTERS.map((example) => (
            <Button
              key={example.label}
              type="button"
              variant="outline"
              onClick={() =>
                onChange({ ...scope, filterState: example.filters })
              }
            >
              <example.icon className="mr-1.5 h-3.5 w-3.5" />
              {example.label}
            </Button>
          ))}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline">
                <FolderCheck className="mr-1.5 h-3.5 w-3.5" />
                {scope.mode === "existing" && selectedScope
                  ? selectedScope.name
                  : "Reuse existing scope"}
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Shared run scopes</DropdownMenuLabel>
              {scope.mode === "existing" && (
                <>
                  <DropdownMenuItem
                    onSelect={() =>
                      onChange({ ...scope, mode: "new", runScopeId: null })
                    }
                  >
                    Define a new run scope...
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {(existingScopes.data?.length ?? 0) === 0 && (
                <DropdownMenuItem disabled>
                  No existing scopes yet
                </DropdownMenuItem>
              )}
              {existingScopes.data?.map((s) => (
                <DropdownMenuItem
                  key={s.id}
                  onSelect={() =>
                    onChange({
                      mode: "existing",
                      runScopeId: s.id,
                      targetObject: s.targetObject as ScopeTargetObject,
                      filterState: s.filter,
                      sampling: s.sampling,
                    })
                  }
                >
                  <span className="flex items-center gap-2">
                    <FolderCheck className="text-muted-foreground h-3.5 w-3.5" />
                    {s.name}
                    <span className="text-muted-foreground text-xs">
                      {s._count.jobConfigurations} evaluator
                      {s._count.jobConfigurations === 1 ? "" : "s"}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {scope.mode === "existing" && selectedScope && (
          <p className="text-muted-foreground text-sm">
            {selectedScope._count.jobConfigurations} evaluator
            {selectedScope._count.jobConfigurations === 1 ? "" : "s"}
            {selectedScope.jobConfigurations.length > 0 && (
              <>
                {" · shared with "}
                {selectedScope.jobConfigurations
                  .map((jc) => jc.scoreName)
                  .join(", ")}
              </>
            )}
          </p>
        )}
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
                    onChange({ ...scope, sampling: value[0] ?? 1 })
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
