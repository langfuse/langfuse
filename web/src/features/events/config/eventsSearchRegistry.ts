import {
  createFieldRegistry,
  EVENTS_FIELD_REGISTRY,
} from "@/src/features/search-bar/lib/fields";

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
    freeTextScopeLabel: useHostSearchScopes
      ? "the selected search scope"
      : EVENTS_FIELD_REGISTRY.freeTextScopeLabel,
    // A scoped registry cannot use the full events AI vocabulary.
    aiFilterPrompt: omittedColumns.length === 0,
  });
}
