import {
  createFieldRegistry,
  EVENTS_FIELD_REGISTRY,
} from "@/src/features/search-bar";

/** `topics` adds the `topics.<facet>:<topic>` syntax; only pass it when canViewTopics passes. */
export function eventsSearchRegistry(
  omittedColumns: readonly string[],
  useHostSearchScopes = false,
  topics = false,
) {
  // Topics is gated by `topics`, not the omitted columns, and is not part of the Ask AI vocabulary.
  const omitted = new Set(
    omittedColumns.filter((column) => column !== "topics"),
  );
  if (omitted.size === 0 && !useHostSearchScopes && !topics)
    return EVENTS_FIELD_REGISTRY;
  return createFieldRegistry({
    ...EVENTS_FIELD_REGISTRY,
    fields: EVENTS_FIELD_REGISTRY.fields.filter(
      (field) => !omitted.has(field.filterColumn ?? field.id),
    ),
    columns: EVENTS_FIELD_REGISTRY.columns.filter(
      (column) => !omitted.has(column.id),
    ),
    metadata: EVENTS_FIELD_REGISTRY.metadata && !omitted.has("metadata"),
    keyedOptionNamespaces: topics ? { topics: "topics" } : undefined,
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
    // A scoped registry cannot use the full events AI vocabulary.
    aiFilterPrompt: omitted.size === 0,
  });
}
