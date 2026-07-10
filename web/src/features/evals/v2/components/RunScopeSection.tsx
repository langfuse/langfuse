import { useMemo, useState } from "react";
import { FolderCheck } from "lucide-react";

import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { Slider } from "@/src/components/ui/slider";
import { useEventsFilterOptions } from "@/src/features/events/hooks/useEventsFilterOptions";
import { EventsSearchBarRow } from "@/src/features/search-bar/components/EventsSearchBarRow";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { useObservedMetadataPaths } from "@/src/features/search-bar/hooks/useObservedMetadata";
import { withMetadataPathOptions } from "@/src/features/search-bar/lib/metadata-paths";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { type ScopeTargetObject } from "@/src/features/evals/v2/lib/useSourceObject";
import { api } from "@/src/utils/api";
import { type FilterState, type TracingSearchType } from "@langfuse/shared";

const NEW_SCOPE_VALUE = "__new__";

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

  const selectedScope =
    scope.mode === "existing"
      ? existingScopes.data?.find((s) => s.id === scope.runScopeId)
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Data source</Label>
        <Select
          value={scope.targetObject}
          disabled={scope.mode === "existing"}
          onValueChange={(value) =>
            onChange({ ...scope, targetObject: value as ScopeTargetObject })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TARGET_OBJECT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Run scope</Label>
        <Select
          value={
            scope.mode === "existing" ? scope.runScopeId! : NEW_SCOPE_VALUE
          }
          onValueChange={(value) => {
            if (value === NEW_SCOPE_VALUE) {
              onChange({ ...scope, mode: "new", runScopeId: null });
              return;
            }
            const selected = existingScopes.data?.find((s) => s.id === value);
            if (!selected) return;
            onChange({
              mode: "existing",
              runScopeId: selected.id,
              targetObject: selected.targetObject as ScopeTargetObject,
              filterState: selected.filter,
              sampling: selected.sampling,
            });
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NEW_SCOPE_VALUE}>
              Define a new run scope...
            </SelectItem>
            {(existingScopes.data?.length ?? 0) > 0 && <SelectSeparator />}
            {existingScopes.data?.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <FolderCheck className="text-muted-foreground h-3.5 w-3.5" />
                  {s.name}
                  <span className="text-muted-foreground text-xs">
                    {s._count.jobConfigurations} evaluator
                    {s._count.jobConfigurations === 1 ? "" : "s"}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

      <div className="flex flex-col gap-2">
        <Label>
          Filter {targetObjectLabel(scope.targetObject).toLowerCase()}
        </Label>
        <ScopeFilterSearchBar
          projectId={projectId}
          filterState={scope.filterState}
          setFilterState={(filterState) => onChange({ ...scope, filterState })}
        />
      </div>

      <div className="flex items-center gap-3">
        <Label className="whitespace-nowrap">Sampling</Label>
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
  );
}
