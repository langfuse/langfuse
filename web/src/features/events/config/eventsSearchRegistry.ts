import {
  createFieldRegistry,
  EVENTS_FIELD_REGISTRY,
} from "@/src/features/search-bar";

const SUMMARY_SEARCH_SCOPE = {
  searchType: ["summary" as const],
  label: "Trace summaries",
  description: "search Topics summaries as whole words",
};

export function eventsSearchRegistry(
  omittedColumns: readonly string[],
  useHostSearchScopes = false,
  includeSummaryScope = false,
) {
  if (
    omittedColumns.length === 0 &&
    !useHostSearchScopes &&
    !includeSummaryScope
  )
    return EVENTS_FIELD_REGISTRY;
  const omitted = new Set(omittedColumns);
  return createFieldRegistry({
    ...EVENTS_FIELD_REGISTRY,
    fields: EVENTS_FIELD_REGISTRY.fields.filter(
      (field) => !omitted.has(field.filterColumn ?? field.id),
    ),
    columns: EVENTS_FIELD_REGISTRY.columns.filter(
      (column) => !omitted.has(column.id),
    ),
    metadata: EVENTS_FIELD_REGISTRY.metadata && !omitted.has("metadata"),
    scores:
      EVENTS_FIELD_REGISTRY.scores &&
      !["scores_avg", "score_categories", "score_booleans"].some((column) =>
        omitted.has(column),
      ),
    traceScores:
      EVENTS_FIELD_REGISTRY.traceScores &&
      ![
        "trace_scores_avg",
        "trace_score_categories",
        "trace_score_booleans",
      ].some((column) => omitted.has(column)),
    searchScopes: includeSummaryScope
      ? { ...EVENTS_FIELD_REGISTRY.searchScopes, summary: SUMMARY_SEARCH_SCOPE }
      : EVENTS_FIELD_REGISTRY.searchScopes,
    defaultSearchType: useHostSearchScopes
      ? ["id"]
      : EVENTS_FIELD_REGISTRY.defaultSearchType,
    freeTextScopeLabel: useHostSearchScopes
      ? "IDs, user IDs and names"
      : EVENTS_FIELD_REGISTRY.freeTextScopeLabel,
    // A scoped registry cannot use the full events AI vocabulary.
    aiFilterPrompt: omittedColumns.length === 0,
  });
}
