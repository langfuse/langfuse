import { useMemo, useState } from "react";
import { ObservationType, type FilterState } from "@langfuse/shared";
import {
  QueryInput,
  useQueryInputController,
  type QueryCompletionPlan,
} from "@/src/components/design-system/QueryInput/QueryInput";
import { filterStateToQueryText } from "@/src/features/search-bar/lib/filter-state-to-query";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import {
  applyPick,
  planInputCompletions,
} from "@/src/features/search-bar/lib/completions";
import { deriveQueryTokens } from "@/src/features/search-bar/lib/fns/deriveQueryTokens";
import { usePrevious } from "@/src/hooks/usePrevious";
import { SESSION_TRACE_FIELD_REGISTRY } from "../../../sessionTraceSearchRegistry";

const SESSION_FILTER_OPTIONS = {
  type: Object.values(ObservationType).map((value) => ({ value })),
};

export function useSessionFilterInput({
  filters,
  onFiltersChange,
}: {
  projectId: string;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}) {
  const filtersKey = JSON.stringify(filters);
  const [draft, setDraft] = useState(() => ({
    filtersKey,
    query: filterStateToQueryText(filters, {}, SESSION_TRACE_FIELD_REGISTRY)
      .text,
  }));
  const [revealedQuery, setRevealedQuery] = useState<string | null>(null);
  // External filter changes replace the draft; local edits retain their syntax.
  const query =
    draft.filtersKey === filtersKey
      ? draft.query
      : filterStateToQueryText(filters, {}, SESSION_TRACE_FIELD_REGISTRY).text;
  if (draft.filtersKey !== filtersKey) setDraft({ filtersKey, query });
  const setQuery = (query: string) =>
    setDraft((draft) => ({ ...draft, query }));
  const parseQuery = (query: string) => {
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
  };
  const plan = parseQuery(query);
  const commit = (query: string) => {
    const parsed = parseQuery(query);
    if (parsed.status === "invalid") {
      setQuery(query);
      setRevealedQuery(query);
      return null;
    }
    setDraft({ filtersKey: JSON.stringify(parsed.filters), query });
    onFiltersChange(parsed.filters);
    return parsed.canonical;
  };
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
      if (commit(query) === null || plan.status === "invalid") return null;
      return plan.filters;
    },
    applyFilters: (filters: FilterState) => {
      setDraft({
        filtersKey: JSON.stringify(filters),
        query: filterStateToQueryText(filters, {}, SESSION_TRACE_FIELD_REGISTRY)
          .text,
      });
      onFiltersChange(filters);
    },
    inputProps: {
      query,
      setQuery,
      commit,
      showDiagnostics: plan.status === "invalid" && revealedQuery === query,
      diagnostics:
        plan.status === "invalid" && revealedQuery === query
          ? plan.diagnostics
          : [],
    },
  };
}

export function SessionFilterInput({
  inputId,
  query,
  setQuery,
  commit,
  showDiagnostics,
  diagnostics,
}: ReturnType<typeof useSessionFilterInput>["inputProps"] & {
  inputId: string;
}) {
  const controller = useQueryInputController();
  const {
    autocompleteOpen,
    selectionSnapshot: { start, end },
  } = controller;
  const tokens = deriveQueryTokens({
    draft: query,
    scoreTypes: undefined,
    registry: SESSION_TRACE_FIELD_REGISTRY,
    showDiagnostics,
    fieldReason: undefined,
    freeTextReason: undefined,
  });
  const completions = useMemo((): QueryCompletionPlan | null => {
    if (!autocompleteOpen || start !== end) return null;
    const plan = planInputCompletions(
      {
        input: query,
        caret: Math.min(end, query.length),
        currentQueryText: query,
        observed: SESSION_FILTER_OPTIONS,
        recents: [],
      },
      SESSION_TRACE_FIELD_REGISTRY,
    );
    if (!plan) return null;
    return {
      autoHighlight: plan.autoHighlight === true,
      loading: plan.loading,
      options: plan.sections.flatMap((section) =>
        section.options.map((option) => {
          const edit =
            option.kind === "recent" || option.kind === "preset"
              ? {
                  next: option.query,
                  caret: option.query.length,
                  keepOpen: false,
                }
              : applyPick(option, query, plan);
          return {
            id: option.id,
            label: option.label,
            detail: option.kind === "recent" ? undefined : option.detail,
            section: section.title,
            selected: option.kind === "value" && option.active,
            edit,
            onApplied: (value: string) => {
              if (
                planCommit(value, undefined, SESSION_TRACE_FIELD_REGISTRY)
                  .status === "committed"
              )
                commit(value);
            },
          };
        }),
      ),
    };
  }, [autocompleteOpen, start, end, query, commit]);
  return (
    <QueryInput
      inputId={inputId}
      label="Observation filters"
      value={query}
      onValueChange={setQuery}
      onCommit={commit}
      diagnostics={diagnostics}
      tokens={tokens}
      placeholder={
        SESSION_TRACE_FIELD_REGISTRY.searchPlaceholder ?? "Filter observations…"
      }
      controller={controller}
      completions={completions}
      areEquivalent={(left, right) => {
        if (left === right) return true;
        const leftPlan = planCommit(
          left,
          undefined,
          SESSION_TRACE_FIELD_REGISTRY,
        );
        const rightPlan = planCommit(
          right,
          undefined,
          SESSION_TRACE_FIELD_REGISTRY,
        );
        return (
          leftPlan.status === "committed" &&
          rightPlan.status === "committed" &&
          leftPlan.canonical === rightPlan.canonical
        );
      }}
      onRemoveToken={(token) => {
        const next = query.slice(0, token.from) + query.slice(token.to);
        setQuery(next);
        if (
          planCommit(next, undefined, SESSION_TRACE_FIELD_REGISTRY).status ===
          "committed"
        )
          commit(next);
      }}
    />
  );
}
