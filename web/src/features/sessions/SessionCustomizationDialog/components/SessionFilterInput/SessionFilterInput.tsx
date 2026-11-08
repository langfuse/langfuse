import { useMemo, useSyncExternalStore } from "react";
import { type FilterState } from "@langfuse/shared";
import { SearchComposer } from "@/src/features/search-bar/components/SearchComposer/SearchComposer";
import { SearchBarStoreProvider } from "@/src/features/search-bar/store/SearchBarStoreProvider";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { useEventsSearchBar } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { usePrevious } from "@/src/hooks/usePrevious";
import { SESSION_TRACE_FIELD_REGISTRY } from "../../../sessionTraceSearchRegistry";

export function useSessionFilterInput({
  projectId,
  filters,
  onFiltersChange,
}: {
  projectId: string;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  const { store, commit, applyFilters } = useEventsSearchBar({
    projectId,
    tableName: "session-traces",
    registry: SESSION_TRACE_FIELD_REGISTRY,
    enabled: true,
    isV4: true,
    filterState: filters,
    setFilterState: onFiltersChange,
    observed: undefined,
    searchQuery: null,
    searchType: [],
    setSearchQuery: () => {},
    setSearchType: () => {},
  });
  const query = useSyncExternalStore(
    store.subscribe,
    () => store.getState().draft,
    () => store.getState().draft,
  );
  const plan = useMemo(() => {
    const parsed = planCommit(query, undefined, SESSION_TRACE_FIELD_REGISTRY);
    if (parsed.status === "invalid") return parsed;
    const { skippedFilters } = filterStateToQueryText(
      filters,
      {},
      SESSION_TRACE_FIELD_REGISTRY,
    );
    // Editing a field replaces its hidden filter; unrelated hidden filters survive.
    const preserved = skippedFilters.filter(
      (skipped) =>
        !parsed.filters.some(
          (filter) =>
            filter.column === skipped.column &&
            filter.target === skipped.target &&
            (filter.type === "stringObject" ||
            filter.type === "numberObject" ||
            filter.type === "booleanObject" ||
            filter.type === "categoryOptions" ||
            filter.type === "positionInTrace"
              ? filter.key
              : undefined) ===
              (skipped.type === "stringObject" ||
              skipped.type === "numberObject" ||
              skipped.type === "booleanObject" ||
              skipped.type === "categoryOptions" ||
              skipped.type === "positionInTrace"
                ? skipped.key
                : undefined),
        ),
    );
    return { ...parsed, filters: [...parsed.filters, ...preserved] };
  }, [query, filters]);
  const lastValidFilters = usePrevious(
    plan.status === "invalid" ? undefined : plan.filters,
    plan.status !== "invalid",
  );
  const activeFilters = useMemo(
    () =>
      plan.status === "invalid" ? (lastValidFilters ?? filters) : plan.filters,
    [plan, lastValidFilters, filters],
  );

  return {
    filters: activeFilters,
    invalid: plan.status === "invalid",
    readFilters: () => {
      commit();
      if (plan.status === "invalid") return null;
      return plan.filters;
    },
    applyFilters,
    inputProps: { projectId, store, commit },
  };
}

export function SessionFilterInput({
  inputId,
  store,
  commit,
  ...props
}: ReturnType<typeof useSessionFilterInput>["inputProps"] & {
  inputId: string;
}) {
  return (
    <SearchBarStoreProvider store={store} commit={commit}>
      <SearchComposer
        {...props}
        inputId={inputId}
        registry={SESSION_TRACE_FIELD_REGISTRY}
        observed={undefined}
      />
    </SearchBarStoreProvider>
  );
}
