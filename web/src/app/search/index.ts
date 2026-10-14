// The search-bar feature's public client surface (RFC rule 8). Named
// re-exports only — exactly what other features already imported.
//
// filters' sessions/users/tracing search registries keep importing
// `lib/fields` by file path: they live on the filters door, and this
// index re-exports ComposerTokens which already imports that door, so
// routing those registries through here would close a runtime cycle.
export { ComposerTokens } from "@/src/app/search/components/ComposerTokens";
export { EventsSearchBarRow } from "@/src/app/search/components/EventsSearchBarRow";
export { TableSearchBar } from "@/src/app/search/components/TableSearchBar";
export {
  type ComposerSize,
  ComposerSurface,
  ComposerText,
} from "@/src/app/search/components/ComposerSurface";
export { useEventsSearchBar } from "@/src/app/search/hooks/useEventsSearchBar";
export { useSearchBarEnabled } from "@/src/app/search/hooks/useSearchBarEnabled";
export { useFullTextSearch } from "@/src/app/search/hooks/useFullTextSearch";
export { astToFilterState } from "@/src/app/search/lib/adapter";
export { buildAiContext } from "@/src/app/search/lib/ai-context";
export { planCommit } from "@/src/app/search/lib/commit";
export {
  applyPick,
  planInputCompletions,
} from "@/src/app/search/lib/completions";
export type { QueryPresetSection } from "@/src/app/search/lib/completions";
export {
  EVENTS_FIELD_REGISTRY,
  createFieldRegistry,
  extendFieldRegistryWithColumns,
  fieldRegistryFromColumns,
  resolveField,
  withFieldOptions,
} from "@/src/app/search/lib/fields";
export type { FieldRegistry } from "@/src/app/search/lib/fields";
export { filterStateToQueryText } from "@/src/app/search/lib/filter-state-to-query";
export { parse } from "@/src/app/search/lib/langQ";
export {
  observedScoreNamesFromOptions,
  toObservedOptions,
  withMetadataPathOptions,
} from "@/src/app/search/lib/observed-options";
export type { ObservedOptions } from "@/src/app/search/lib/observed-options";
export { filterRank } from "@/src/app/search/lib/rank";
export { runSearchBarInvariants } from "@/src/app/search/lib/searchBarInvariants";
export { validateQuery } from "@/src/app/search/lib/validate";
export { createSearchBarStore } from "@/src/app/search/store/searchBarStore";
