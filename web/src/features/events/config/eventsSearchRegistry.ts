import {
  createFieldRegistry,
  EVENTS_FIELD_REGISTRY,
} from "@/src/features/search-bar";

export function eventsSearchRegistry(
  omittedColumns: readonly string[],
  useHostSearchScopes = false,
) {
  if (omittedColumns.length === 0 && !useHostSearchScopes)
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
    keyedOptionNamespaces: Object.fromEntries(
      Object.entries(EVENTS_FIELD_REGISTRY.keyedOptionNamespaces ?? {}).filter(
        ([, column]) => !omitted.has(column),
      ),
    ),
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
    defaultSearchType: useHostSearchScopes
      ? ["id"]
      : EVENTS_FIELD_REGISTRY.defaultSearchType,
    freeTextScopeLabel: useHostSearchScopes
      ? "IDs, user IDs and names"
      : EVENTS_FIELD_REGISTRY.freeTextScopeLabel,
    // A scoped registry cannot use the full events AI vocabulary. Topics is not part
    // of that vocabulary, so hiding it (Topics unavailable) keeps Ask AI on.
    aiFilterPrompt: omittedColumns.every((column) => column === "topics"),
  });
}
